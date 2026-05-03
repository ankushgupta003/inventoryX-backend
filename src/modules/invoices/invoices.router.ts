import { InvoiceStatus, Prisma, ProformaInvoiceStatus } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import {
  buildLedgerEntryData,
  ledgerBatchKey,
  loadLedgerBatchSnapshots,
  parseDateOnly,
  toAmountDecimal,
  toQtyDecimal,
} from '../production/production.utils';
import {
  computeProformaInvoiceStatus,
  formatInvoiceNo,
  serializeInvoice,
  toRemainingQty,
} from '../sales/sales.utils';
import { decimalToNumber } from '../shared/masterData';
import { invoiceCreateSchema, invoiceListQuerySchema } from './invoices.schemas';

const statusMap = {
  partial: InvoiceStatus.PARTIAL,
  completed: InvoiceStatus.COMPLETED,
} as const;

function buildInvoiceWhere(
  companyId: string,
  query: ReturnType<typeof invoiceListQuerySchema.parse>,
): Prisma.InvoiceWhereInput {
  return {
    companyId,
    ...(query.status !== 'all' ? { status: statusMap[query.status] } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.proformaInvoiceId ? { proformaInvoiceId: query.proformaInvoiceId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          date: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNo: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
            {
              proformaInvoice: {
                piNo: { contains: query.search, mode: 'insensitive' },
              },
            },
          ],
        }
      : {}),
  };
}

async function getInvoiceOrThrow(companyId: string, id: string) {
  const record = await prisma.invoice.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      items: true,
      proformaInvoice: {
        select: {
          id: true,
          piNo: true,
        },
      },
    },
  });

  if (!record) {
    throw new AppError(404, 'Invoice not found');
  }

  return record;
}

function buildSummary(records: Array<{ status: InvoiceStatus }>) {
  return records.reduce(
    (acc, record) => {
      acc.total += 1;
      acc[record.status] += 1;
      return acc;
    },
    {
      total: 0,
      PARTIAL: 0,
      COMPLETED: 0,
    },
  );
}

export const invoicesRouter = Router();

invoicesRouter.get('/', requirePermission('invoices.view'), async (req, res, next) => {
  try {
    const query = invoiceListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildInvoiceWhere(companyId, query);
    const records = await prisma.invoice.findMany({
      where,
      include: {
        items: true,
        proformaInvoice: {
          select: {
            id: true,
            piNo: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { invoiceSequence: 'desc' }],
    });

    res.json({
      data: records.map(serializeInvoice),
      meta: {
        summary: buildSummary(records),
      },
    });
  } catch (error) {
    next(error);
  }
});

invoicesRouter.get('/:id', requirePermission('invoices.view'), async (req, res, next) => {
  try {
    const record = await getInvoiceOrThrow(req.auth!.companyId!, String(req.params.id));
    res.json({ data: serializeInvoice(record) });
  } catch (error) {
    next(error);
  }
});

invoicesRouter.post('/', requirePermission('invoices.create'), async (req, res, next) => {
  try {
    const payload = invoiceCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const created = await prisma.$transaction(async (tx) => {
      const sourcePi = await tx.proformaInvoice.findFirst({
        where: {
          id: payload.proformaInvoiceId,
          companyId,
        },
        include: {
          items: true,
        },
      });

      if (!sourcePi) {
        throw new AppError(404, 'Source PI not found');
      }

      if (sourcePi.status === ProformaInvoiceStatus.CLOSED || sourcePi.status === ProformaInvoiceStatus.COMPLETED) {
        throw new AppError(400, 'Closed or completed PI cannot be invoiced');
      }

      const piItemMap = new Map(sourcePi.items.map((item) => [item.id, item]));
      const requestedBatchPairs = payload.items.map((item) => ({
        itemId: item.itemId,
        batchNo: item.batchNo,
      }));
      const batchSnapshots = await loadLedgerBatchSnapshots(tx, companyId, requestedBatchPairs);
      const uniqueBatchKeys = Array.from(new Set(requestedBatchPairs.map((item) => ledgerBatchKey(item.itemId, item.batchNo))));
      const batchKeyParts = uniqueBatchKeys.map((key) => {
        const [itemId, batchNo] = key.split('::');
        return { itemId, batchNo };
      });
      const uniqueItemIds = Array.from(new Set(batchKeyParts.map((item) => item.itemId)));
      const uniqueBatchNos = Array.from(new Set(batchKeyParts.map((item) => item.batchNo)));
      const productionBatches = uniqueBatchKeys.length
        ? await tx.productionBatch.findMany({
            where: {
              companyId,
              itemId: { in: uniqueItemIds },
              batchNo: { in: uniqueBatchNos },
            },
            select: {
              id: true,
              itemId: true,
              batchNo: true,
            },
          })
        : [];
      const productionBatchMap = new Map(
        productionBatches.map((batch) => [ledgerBatchKey(batch.itemId, batch.batchNo), batch.id]),
      );

      const qtyByPiLine = new Map<string, number>();
      const qtyByBatch = new Map<string, number>();

      const preparedLines = payload.items.map((line, index) => {
        const piLine = piItemMap.get(line.proformaInvoiceItemId);

        if (!piLine) {
          throw new AppError(400, `Invoice line ${index + 1} references an invalid PI line`);
        }

        if (piLine.itemId !== line.itemId) {
          throw new AppError(400, `Invoice line ${index + 1} item does not match the selected PI line`);
        }

        const remainingQty = toRemainingQty(piLine.quantity, piLine.invoicedQty);
        const nextLineQty = (qtyByPiLine.get(piLine.id) ?? 0) + line.invoiceQty;

        if (line.invoiceQty > remainingQty || nextLineQty > remainingQty) {
          throw new AppError(400, `Invoice line ${index + 1} exceeds remaining PI quantity`);
        }

        qtyByPiLine.set(piLine.id, Number(nextLineQty.toFixed(3)));

        const batchKey = ledgerBatchKey(line.itemId, line.batchNo);
        const batchSnapshot = batchSnapshots.get(batchKey);

        if (!batchSnapshot || batchSnapshot.availableQty <= 0) {
          throw new AppError(400, `Invoice line ${index + 1} batch ${line.batchNo} has no available stock`);
        }

        const nextBatchQty = (qtyByBatch.get(batchKey) ?? 0) + line.invoiceQty;

        if (nextBatchQty > batchSnapshot.availableQty) {
          throw new AppError(400, `Invoice line ${index + 1} exceeds available stock for batch ${line.batchNo}`);
        }

        qtyByBatch.set(batchKey, Number(nextBatchQty.toFixed(3)));

        const amount = Number((line.invoiceQty * line.rate).toFixed(2));
        const taxAmount = Number((amount * line.taxPercent / 100).toFixed(2));

        return {
          lineNo: index + 1,
          proformaInvoiceItemId: piLine.id,
          itemId: line.itemId,
          itemName: piLine.itemName,
          unit: piLine.unit,
          batchNo: line.batchNo,
          invoiceQty: line.invoiceQty,
          rate: line.rate,
          taxPercent: line.taxPercent,
          amount,
          taxAmount,
          mfgDate: batchSnapshot.mfgDate,
          expiryDate: batchSnapshot.expiryDate,
          productionBatchId: productionBatchMap.get(batchKey) ?? null,
        };
      });

      const totalQuantity = preparedLines.reduce((sum, line) => sum + line.invoiceQty, 0);
      const totalAmount = preparedLines.reduce((sum, line) => sum + line.amount, 0);
      const taxAmount = preparedLines.reduce((sum, line) => sum + line.taxAmount, 0);
      const nextPiItems = sourcePi.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        invoicedQty: (qtyByPiLine.get(item.id) ?? 0) + decimalToNumber(item.invoicedQty),
      }));
      const nextPiStatus = computeProformaInvoiceStatus(nextPiItems);
      const nextInvoiceStatus =
        nextPiStatus === ProformaInvoiceStatus.COMPLETED ? InvoiceStatus.COMPLETED : InvoiceStatus.PARTIAL;

      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          invoiceSequence: {
            increment: 1,
          },
        },
        select: {
          invoiceSequence: true,
        },
      });

      const createdInvoice = await tx.invoice.create({
        data: {
          companyId,
          proformaInvoiceId: sourcePi.id,
          customerId: sourcePi.customerId,
          invoiceNo: formatInvoiceNo(sequenceState.invoiceSequence),
          invoiceSequence: sequenceState.invoiceSequence,
          date: parseDateOnly(payload.date),
          status: nextInvoiceStatus,
          customerName: sourcePi.customerName,
          customerContactPerson: sourcePi.customerContactPerson,
          customerPhone: sourcePi.customerPhone,
          customerEmail: sourcePi.customerEmail,
          customerAddress1: sourcePi.customerAddress1,
          customerAddress2: sourcePi.customerAddress2,
          customerCity: sourcePi.customerCity,
          customerState: sourcePi.customerState,
          customerPincode: sourcePi.customerPincode,
          customerGstNumber: sourcePi.customerGstNumber,
          customerPanNumber: sourcePi.customerPanNumber,
          totalQuantity: toQtyDecimal(totalQuantity),
          totalAmount: toAmountDecimal(totalAmount),
          taxAmount: toAmountDecimal(taxAmount),
          items: {
            create: preparedLines.map((line) => ({
              lineNo: line.lineNo,
              proformaInvoiceItemId: line.proformaInvoiceItemId,
              itemId: line.itemId,
              itemName: line.itemName,
              unit: line.unit,
              batchNo: line.batchNo,
              quantity: toQtyDecimal(line.invoiceQty),
              rate: toAmountDecimal(line.rate),
              taxPercent: toAmountDecimal(line.taxPercent),
              amount: toAmountDecimal(line.amount),
            })),
          },
        },
        include: {
          items: true,
          proformaInvoice: {
            select: {
              id: true,
              piNo: true,
            },
          },
        },
      });

      await tx.stockLedgerEntry.createMany({
        data: preparedLines.map((line) =>
          buildLedgerEntryData({
            companyId,
            itemId: line.itemId,
            invoiceId: createdInvoice.id,
            productionBatchId: line.productionBatchId ?? undefined,
            date: payload.date,
            referenceNo: createdInvoice.invoiceNo,
            type: 'INVOICE',
            particulars: sourcePi.customerName,
            itemName: line.itemName,
            itemCategory: 'FINISHED',
            batchNo: line.batchNo,
            mfgDate: line.mfgDate,
            expiryDate: line.expiryDate,
            receiptQty: 0,
            issueQty: line.invoiceQty,
            rate: line.rate,
            remarks: `Invoice ${createdInvoice.invoiceNo}`,
          }),
        ),
      });

      await Promise.all(
        sourcePi.items.map((item) => {
          const incrementQty = qtyByPiLine.get(item.id) ?? 0;

          if (incrementQty <= 0) {
            return Promise.resolve();
          }

          return tx.proformaInvoiceItem.update({
            where: { id: item.id },
            data: {
              invoicedQty: {
                increment: incrementQty,
              },
            },
          });
        }),
      );

      await tx.proformaInvoice.update({
        where: { id: sourcePi.id },
        data: {
          status: nextPiStatus,
        },
      });

      return createdInvoice;
    });

    res.status(201).json({ data: serializeInvoice(created) });
  } catch (error) {
    next(error);
  }
});

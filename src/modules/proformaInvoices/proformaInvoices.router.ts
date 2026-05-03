import { ItemType, Prisma, ProformaInvoiceStatus } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import { parseDateOnly, toAmountDecimal, toQtyDecimal } from '../production/production.utils';
import {
  buildCustomerSnapshot,
  formatProformaInvoiceNo,
  hasInvoicingStarted,
  serializeProformaInvoice,
} from '../sales/sales.utils';
import { proformaInvoiceListQuerySchema, proformaInvoiceUpsertSchema } from './proformaInvoices.schemas';

const statusMap = {
  pending: ProformaInvoiceStatus.PENDING,
  partial: ProformaInvoiceStatus.PARTIAL,
  completed: ProformaInvoiceStatus.COMPLETED,
  closed: ProformaInvoiceStatus.CLOSED,
} as const;

type QueryClient = Prisma.TransactionClient | typeof prisma;

function buildProformaInvoiceWhere(
  companyId: string,
  query: ReturnType<typeof proformaInvoiceListQuerySchema.parse>,
): Prisma.ProformaInvoiceWhereInput {
  return {
    companyId,
    ...(query.status !== 'all' ? { status: statusMap[query.status] } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
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
            { piNo: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

async function getProformaInvoiceOrThrow(companyId: string, id: string) {
  const record = await prisma.proformaInvoice.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      items: true,
    },
  });

  if (!record) {
    throw new AppError(404, 'Proforma invoice not found');
  }

  return record;
}

async function loadActiveCustomerOrThrow(db: QueryClient, companyId: string, customerId: string) {
  const customer = await db.party.findFirst({
    where: {
      id: customerId,
      companyId,
      isActive: true,
      partyType: {
        in: ['CUSTOMER', 'BOTH'],
      },
    },
  });

  if (!customer) {
    throw new AppError(400, 'Selected customer must be an active customer party');
  }

  return customer;
}

async function loadActiveFinishedItemsOrThrow(db: QueryClient, companyId: string, itemIds: string[]) {
  const rows = await db.item.findMany({
    where: {
      id: { in: itemIds },
      companyId,
      isActive: true,
      itemType: ItemType.FINISHED,
    },
  });

  const itemMap = new Map(rows.map((row) => [row.id, row]));

  if (itemMap.size !== itemIds.length) {
    throw new AppError(400, 'All PI lines must reference active finished items');
  }

  return itemMap;
}

function buildSummary(records: Array<{ status: ProformaInvoiceStatus }>) {
  return records.reduce(
    (acc, record) => {
      acc.total += 1;
      acc[record.status] += 1;
      return acc;
    },
    {
      total: 0,
      PENDING: 0,
      PARTIAL: 0,
      COMPLETED: 0,
      CLOSED: 0,
    },
  );
}

function buildLineItems(
  itemMap: Map<string, Awaited<ReturnType<typeof prisma.item.findMany>>[number]>,
  items: ReturnType<typeof proformaInvoiceUpsertSchema.parse>['items'],
) {
  return items.map((row, index) => {
    const item = itemMap.get(row.itemId);

    if (!item) {
      throw new AppError(400, `PI line ${index + 1} references an invalid finished item`);
    }

    return {
      lineNo: index + 1,
      itemId: item.id,
      itemName: item.storeName,
      unit: item.baseUnit,
      quantity: toQtyDecimal(row.quantity),
      invoicedQty: toQtyDecimal(0),
      rate: toAmountDecimal(row.rate),
      amount: toAmountDecimal(row.quantity * row.rate),
      remarks: row.remarks ?? null,
    };
  });
}

export const proformaInvoicesRouter = Router();

proformaInvoicesRouter.get('/', requirePermission('proforma_invoices.view'), async (req, res, next) => {
  try {
    const query = proformaInvoiceListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildProformaInvoiceWhere(companyId, query);
    const records = await prisma.proformaInvoice.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: [{ date: 'desc' }, { piSequence: 'desc' }],
    });

    res.json({
      data: records.map(serializeProformaInvoice),
      meta: {
        summary: buildSummary(records),
      },
    });
  } catch (error) {
    next(error);
  }
});

proformaInvoicesRouter.get('/:id', requirePermission('proforma_invoices.view'), async (req, res, next) => {
  try {
    const record = await getProformaInvoiceOrThrow(req.auth!.companyId!, String(req.params.id));
    res.json({ data: serializeProformaInvoice(record) });
  } catch (error) {
    next(error);
  }
});

proformaInvoicesRouter.post('/', requirePermission('proforma_invoices.create'), async (req, res, next) => {
  try {
    const payload = proformaInvoiceUpsertSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const itemIds = Array.from(new Set(payload.items.map((item) => item.itemId)));
    const [customer, itemMap] = await Promise.all([
      loadActiveCustomerOrThrow(prisma, companyId, payload.customerId),
      loadActiveFinishedItemsOrThrow(prisma, companyId, itemIds),
    ]);

    const totalQuantity = payload.items.reduce((sum, row) => sum + row.quantity, 0);
    const totalAmount = payload.items.reduce((sum, row) => sum + (row.quantity * row.rate), 0);

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          proformaInvoiceSequence: {
            increment: 1,
          },
        },
        select: {
          proformaInvoiceSequence: true,
        },
      });

      return tx.proformaInvoice.create({
        data: {
          companyId,
          piNo: formatProformaInvoiceNo(sequenceState.proformaInvoiceSequence),
          piSequence: sequenceState.proformaInvoiceSequence,
          date: parseDateOnly(payload.date),
          status: ProformaInvoiceStatus.PENDING,
          ...buildCustomerSnapshot(customer),
          totalQuantity: toQtyDecimal(totalQuantity),
          totalAmount: toAmountDecimal(totalAmount),
          items: {
            create: buildLineItems(itemMap, payload.items),
          },
        },
        include: {
          items: true,
        },
      });
    });

    res.status(201).json({ data: serializeProformaInvoice(created) });
  } catch (error) {
    next(error);
  }
});

proformaInvoicesRouter.put('/:id', requirePermission('proforma_invoices.edit'), async (req, res, next) => {
  try {
    const payload = proformaInvoiceUpsertSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const record = await getProformaInvoiceOrThrow(companyId, String(req.params.id));

    if (record.status !== ProformaInvoiceStatus.PENDING || hasInvoicingStarted(record.items)) {
      throw new AppError(400, 'PI can be edited only while it is open and invoicing has not started');
    }

    const itemIds = Array.from(new Set(payload.items.map((item) => item.itemId)));
    const [customer, itemMap] = await Promise.all([
      loadActiveCustomerOrThrow(prisma, companyId, payload.customerId),
      loadActiveFinishedItemsOrThrow(prisma, companyId, itemIds),
    ]);

    const totalQuantity = payload.items.reduce((sum, row) => sum + row.quantity, 0);
    const totalAmount = payload.items.reduce((sum, row) => sum + (row.quantity * row.rate), 0);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.proformaInvoiceItem.deleteMany({
        where: {
          proformaInvoiceId: record.id,
        },
      });

      return tx.proformaInvoice.update({
        where: { id: record.id },
        data: {
          date: parseDateOnly(payload.date),
          status: ProformaInvoiceStatus.PENDING,
          ...buildCustomerSnapshot(customer),
          totalQuantity: toQtyDecimal(totalQuantity),
          totalAmount: toAmountDecimal(totalAmount),
          items: {
            create: buildLineItems(itemMap, payload.items),
          },
        },
        include: {
          items: true,
        },
      });
    });

    res.json({ data: serializeProformaInvoice(updated) });
  } catch (error) {
    next(error);
  }
});

proformaInvoicesRouter.post('/:id/close', requirePermission('proforma_invoices.edit'), async (req, res, next) => {
  try {
    const record = await getProformaInvoiceOrThrow(req.auth!.companyId!, String(req.params.id));

    if (record.status === ProformaInvoiceStatus.CLOSED || record.status === ProformaInvoiceStatus.COMPLETED) {
      throw new AppError(400, 'Only pending or partial PI records can be closed');
    }

    const closed = await prisma.proformaInvoice.update({
      where: { id: record.id },
      data: {
        status: ProformaInvoiceStatus.CLOSED,
      },
      include: {
        items: true,
      },
    });

    res.json({ data: serializeProformaInvoice(closed) });
  } catch (error) {
    next(error);
  }
});

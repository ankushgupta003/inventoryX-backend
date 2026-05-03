import { ItemType, PartyType, Prisma } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import { decimalToNumber, toNullableString } from '../shared/masterData';
import { purchaseGinCreateSchema, purchaseGinListQuerySchema } from './purchases.schemas';
import {
  buildLedgerCreateData,
  buildPurchaseGinOrderBy,
  buildPurchaseGinWhere,
  formatGinNo,
  parseDateOnly,
  serializePurchaseGinDetail,
  serializePurchaseGinList,
  toAmountDecimal,
  toQtyDecimal,
  toRateDecimal,
} from './purchases.utils';

export const purchasesRouter = Router();

purchasesRouter.get('/', requirePermission('purchases.view'), async (req, res, next) => {
  try {
    const query = purchaseGinListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildPurchaseGinWhere(companyId, query);

    const [filteredTotal, rows, summary, vendorRows] = await Promise.all([
      prisma.purchaseGin.count({ where }),
      prisma.purchaseGin.findMany({
        where,
        orderBy: buildPurchaseGinOrderBy(query.sortBy, query.sortOrder),
        include: {
          _count: {
            select: {
              items: true,
            },
          },
        },
        ...(query.paginate
          ? {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }
          : {}),
      }),
      prisma.purchaseGin.aggregate({
        where,
        _sum: {
          totalAmount: true,
          totalAcceptedQty: true,
          totalRejectedQty: true,
        },
      }),
      prisma.purchaseGin.findMany({
        where,
        distinct: ['vendorId'],
        select: { vendorId: true },
      }),
    ]);

    const totalPages = query.paginate ? Math.ceil(filteredTotal / query.limit) : 1;

    res.json({
      data: rows.map(serializePurchaseGinList),
      meta: {
        pagination: {
          page: query.paginate ? query.page : 1,
          limit: query.paginate ? query.limit : filteredTotal,
          total: filteredTotal,
          totalPages,
          hasNextPage: query.paginate ? query.page < totalPages : false,
          hasPreviousPage: query.paginate ? query.page > 1 : false,
          paginate: query.paginate,
        },
        filters: {
          search: query.search,
          vendorId: query.vendorId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        },
        sort: {
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        summary: {
          count: filteredTotal,
          totalAmount: decimalToNumber(summary._sum.totalAmount ?? new Prisma.Decimal(0)),
          totalAcceptedQty: decimalToNumber(summary._sum.totalAcceptedQty ?? new Prisma.Decimal(0)),
          totalRejectedQty: decimalToNumber(summary._sum.totalRejectedQty ?? new Prisma.Decimal(0)),
          vendorCount: vendorRows.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

purchasesRouter.get('/:id', requirePermission('purchases.view'), async (req, res, next) => {
  try {
    const record = await prisma.purchaseGin.findFirst({
      where: {
        id: String(req.params.id),
        companyId: req.auth!.companyId!,
      },
      include: {
        items: true,
      },
    });

    if (!record) {
      throw new AppError(404, 'Purchase GIN not found');
    }

    res.json({ data: serializePurchaseGinDetail(record) });
  } catch (error) {
    next(error);
  }
});

purchasesRouter.post('/', requirePermission('purchases.create'), async (req, res, next) => {
  try {
    const payload = purchaseGinCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const vendor = await prisma.party.findFirst({
      where: {
        id: payload.vendorId,
        companyId,
      },
    });

    if (!vendor || !vendor.isActive || (vendor.partyType !== PartyType.VENDOR && vendor.partyType !== PartyType.BOTH)) {
      throw new AppError(400, 'Selected vendor must be an active vendor or both-party record');
    }

    const uniqueItemIds = [...new Set(payload.items.map((item) => item.itemId))];
    const items = await prisma.item.findMany({
      where: {
        id: { in: uniqueItemIds },
        companyId,
      },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    payload.items.forEach((line, index) => {
      const item = itemMap.get(line.itemId);
      if (!item || !item.isActive || item.itemType !== ItemType.RAW) {
        throw new AppError(400, `Item on line ${index + 1} must be an active raw item`);
      }
    });

    const lineCalculations = payload.items.map((line) => {
      const taxableValue = Number(line.taxableValue.toFixed(2));
      const cgstAmount = Number(((taxableValue * line.cgstRate) / 100).toFixed(2));
      const sgstAmount = Number(((taxableValue * line.sgstRate) / 100).toFixed(2));
      const igstAmount = Number(((taxableValue * line.igstRate) / 100).toFixed(2));
      const lineTotalAmount = Number((taxableValue + cgstAmount + sgstAmount + igstAmount).toFixed(2));

      return {
        taxableValue,
        cgstAmount,
        sgstAmount,
        igstAmount,
        lineTotalAmount,
      };
    });

    const totalTaxableValue = lineCalculations.reduce((sum, line) => sum + line.taxableValue, 0);
    const totalCgstAmount = lineCalculations.reduce((sum, line) => sum + line.cgstAmount, 0);
    const totalSgstAmount = lineCalculations.reduce((sum, line) => sum + line.sgstAmount, 0);
    const totalIgstAmount = lineCalculations.reduce((sum, line) => sum + line.igstAmount, 0);
    const totalAmount = lineCalculations.reduce((sum, line) => sum + line.lineTotalAmount, 0);
    const totalAcceptedQty = payload.items.reduce((sum, line) => sum + line.acceptedQty, 0);
    const totalRejectedQty = payload.items.reduce((sum, line) => sum + line.rejectedQty, 0);

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          purchaseGinSequence: {
            increment: 1,
          },
        },
        select: {
          purchaseGinSequence: true,
        },
      });

      const ginSequence = sequenceState.purchaseGinSequence;
      const ginNo = formatGinNo(ginSequence);

      const purchase = await tx.purchaseGin.create({
        data: {
          companyId,
          ginNo,
          ginSequence,
          vendorId: vendor.id,
          vendorName: vendor.name,
          challanNo: payload.challanNo.trim(),
          challanDate: parseDateOnly(payload.challanDate),
          billNo: payload.billNo.trim(),
          billDate: parseDateOnly(payload.billDate),
          gateEntryNo: payload.gateEntryNo.trim(),
          entryDate: parseDateOnly(payload.entryDate),
          preparedBy: toNullableString(payload.preparedBy),
          sanctionedBy: toNullableString(payload.sanctionedBy),
          authorizedSignatory: toNullableString(payload.authorizedSignatory),
          totalTaxableValue: toAmountDecimal(totalTaxableValue),
          totalCgstAmount: toAmountDecimal(totalCgstAmount),
          totalSgstAmount: toAmountDecimal(totalSgstAmount),
          totalIgstAmount: toAmountDecimal(totalIgstAmount),
          totalAmount: toAmountDecimal(totalAmount),
          totalAcceptedQty: toQtyDecimal(totalAcceptedQty),
          totalRejectedQty: toQtyDecimal(totalRejectedQty),
          items: {
            create: payload.items.map((line, index) => {
              const item = itemMap.get(line.itemId)!;
              const taxLine = lineCalculations[index];
              return {
                itemId: item.id,
                lineNo: index + 1,
                itemName: item.storeName,
                itemType: item.itemType,
                baseUnit: item.baseUnit,
                ulpQty: toQtyDecimal(line.ulpQty),
                billQty: toQtyDecimal(line.billQty),
                receivedQty: toQtyDecimal(line.receivedQty),
                acceptedQty: toQtyDecimal(line.acceptedQty),
                rejectedQty: toQtyDecimal(line.rejectedQty),
                batchNo: line.batchNo.trim(),
                mfgDate: line.mfgDate ?? null,
                expiryDate: line.expiryDate ?? null,
                rate: toRateDecimal(line.rate),
                taxableValue: toAmountDecimal(taxLine.taxableValue),
                cgstRate: toAmountDecimal(line.cgstRate),
                cgstAmount: toAmountDecimal(taxLine.cgstAmount),
                sgstRate: toAmountDecimal(line.sgstRate),
                sgstAmount: toAmountDecimal(taxLine.sgstAmount),
                igstRate: toAmountDecimal(line.igstRate),
                igstAmount: toAmountDecimal(taxLine.igstAmount),
                lineTotalAmount: toAmountDecimal(taxLine.lineTotalAmount),
                amount: toAmountDecimal(taxLine.taxableValue),
                remarks: toNullableString(line.remarks),
              };
            }),
          },
        },
        include: {
          items: true,
        },
      });

      const ledgerEntries = payload.items
        .filter((line) => line.acceptedQty > 0)
        .map((line) => {
          const item = itemMap.get(line.itemId)!;
          return buildLedgerCreateData({
            companyId,
            purchaseGinId: purchase.id,
            itemId: item.id,
            date: payload.entryDate,
            referenceNo: purchase.ginNo,
            particulars: vendor.name,
            itemName: item.storeName,
            itemCategory: item.itemType,
            batchNo: line.batchNo.trim(),
            mfgDate: line.mfgDate,
            expiryDate: line.expiryDate,
            receiptQty: line.acceptedQty,
            rate: line.rate,
            remarks: line.remarks,
          });
        });

      if (ledgerEntries.length > 0) {
        await tx.stockLedgerEntry.createMany({
          data: ledgerEntries,
        });
      }

      return purchase;
    });

    res.status(201).json({ data: serializePurchaseGinDetail(created) });
  } catch (error) {
    next(error);
  }
});

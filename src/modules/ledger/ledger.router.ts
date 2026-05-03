import { Prisma, StockLedgerEntryType } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import { decimalToNumber, normalizeLookupValue } from '../shared/masterData';
import { buildLedgerEntryData } from '../production/production.utils';
import { ledgerCreateSchema, ledgerListQuerySchema, type LedgerCreateInput, type LedgerListQuery } from './ledger.schemas';
import { parseDateOnly, serializeLedgerEntry } from '../purchases/purchases.utils';

const ledgerTypeMap = {
  purchase: StockLedgerEntryType.PURCHASE,
  issue: StockLedgerEntryType.ISSUE,
  production: StockLedgerEntryType.PRODUCTION,
  invoice: StockLedgerEntryType.INVOICE,
  return: StockLedgerEntryType.RETURN,
  transfer: StockLedgerEntryType.TRANSFER,
  sampling: StockLedgerEntryType.SAMPLING,
} as const;

function buildLedgerWhere(companyId: string, query: LedgerListQuery): Prisma.StockLedgerEntryWhereInput {
  const andFilters: Prisma.StockLedgerEntryWhereInput[] = [];

  if (query.search) {
    andFilters.push({
      OR: [
        { referenceNo: { contains: query.search, mode: 'insensitive' } },
        { particulars: { contains: query.search, mode: 'insensitive' } },
        { itemName: { contains: query.search, mode: 'insensitive' } },
        { batchNo: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }

  if (query.itemId) {
    andFilters.push({
      OR: [
        { itemId: query.itemId },
        { itemName: { equals: query.itemId, mode: 'insensitive' } },
      ],
    });
  }

  return {
    companyId,
    ...(andFilters.length ? { AND: andFilters } : {}),
    ...(query.batchNo
      ? {
          batchNo: {
            equals: query.batchNo,
            mode: 'insensitive',
          },
        }
      : {}),
    ...(query.type !== 'all'
      ? {
          type: ledgerTypeMap[query.type],
        }
      : {}),
    ...(query.itemCategory !== 'all'
      ? {
          itemCategory: query.itemCategory,
        }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          date: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
  };
}

export const ledgerRouter = Router();

ledgerRouter.get('/', requirePermission('stock_ledger.view'), async (req, res, next) => {
  try {
    const query = ledgerListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildLedgerWhere(companyId, query);
    const [total, rows] = await Promise.all([
      prisma.stockLedgerEntry.count({ where }),
      prisma.stockLedgerEntry.findMany({
        where,
        orderBy: [{ date: query.sortOrder }, { createdAt: query.sortOrder }],
        ...(query.paginate
          ? {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }
          : {}),
      }),
    ]);

    res.json({
      data: rows.map(serializeLedgerEntry),
      total,
    });
  } catch (error) {
    next(error);
  }
});

ledgerRouter.post('/', requirePermission('stock_ledger.create'), async (req, res, next) => {
  try {
    const normalizedBody = req.body && typeof req.body === 'object' && 'entries' in req.body
      ? req.body
      : { entries: [req.body] };
    const payload = ledgerCreateSchema.parse(normalizedBody) as LedgerCreateInput;
    const companyId = req.auth!.companyId!;

    const requestedIds = Array.from(new Set(payload.entries.map((entry) => entry.itemId).filter(Boolean)));
    const requestedNames = Array.from(
      new Set(payload.entries.map((entry) => entry.itemName).filter((value): value is string => Boolean(value))),
    );

    const items = await prisma.item.findMany({
      where: {
        companyId,
        OR: [
          ...(requestedIds.length ? [{ id: { in: requestedIds } }] : []),
          ...(requestedNames.length
            ? [
                {
                  storeNameNormalized: {
                    in: requestedNames.map(normalizeLookupValue),
                  },
                },
              ]
            : []),
        ],
      },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const itemByName = new Map(items.map((item) => [normalizeLookupValue(item.storeName), item]));

    const productionBatchIds = Array.from(new Set(payload.entries.map((entry) => entry.productionBatchId).filter(Boolean)));
    const stockMovementIds = Array.from(new Set(payload.entries.map((entry) => entry.stockMovementId).filter(Boolean)));

    const [productionBatches, stockMovements] = await Promise.all([
      productionBatchIds.length
        ? prisma.productionBatch.findMany({
            where: {
              companyId,
              id: { in: productionBatchIds },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      stockMovementIds.length
        ? prisma.stockMovement.findMany({
            where: {
              companyId,
              id: { in: stockMovementIds },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const productionBatchIdSet = new Set(productionBatches.map((row) => row.id));
    const stockMovementIdSet = new Set(stockMovements.map((row) => row.id));

    const data = payload.entries.map((entry, index) => {
      const item =
        (entry.itemId ? itemById.get(entry.itemId) : null) ??
        (entry.itemName ? itemByName.get(normalizeLookupValue(entry.itemName)) : null);

      if (!item) {
        throw new AppError(400, `Ledger entry ${index + 1} references an invalid item`);
      }

      if (entry.itemCategory !== item.itemType) {
        const expectedCategory = item.itemType;
        throw new AppError(400, `Ledger entry ${index + 1} item category must be ${expectedCategory}`);
      }

      if (entry.productionBatchId && !productionBatchIdSet.has(entry.productionBatchId)) {
        throw new AppError(400, `Ledger entry ${index + 1} references an invalid production batch`);
      }

      if (entry.stockMovementId && !stockMovementIdSet.has(entry.stockMovementId)) {
        throw new AppError(400, `Ledger entry ${index + 1} references an invalid stock movement`);
      }

      return buildLedgerEntryData({
        companyId,
        itemId: item.id,
        productionBatchId: entry.productionBatchId || undefined,
        stockMovementId: entry.stockMovementId || undefined,
        date: entry.date,
        referenceNo: entry.referenceNo,
        type: entry.type.toUpperCase() as 'PURCHASE' | 'ISSUE' | 'SAMPLING' | 'PRODUCTION' | 'TRANSFER' | 'INVOICE' | 'RETURN',
        particulars: entry.particulars,
        itemName: item.storeName,
        itemCategory: item.itemType,
        batchNo: entry.batchNo,
        mfgDate: entry.mfgDate,
        expiryDate: entry.expiryDate,
        receiptQty: entry.receiptQty,
        issueQty: entry.issueQty,
        rate: entry.rate,
        remarks: entry.remarks ?? '',
      });
    });

    await prisma.stockLedgerEntry.createMany({ data });

    const created = await prisma.stockLedgerEntry.findMany({
      where: {
        companyId,
        referenceNo: {
          in: payload.entries.map((entry) => entry.referenceNo),
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: data.length,
    });

    res.status(201).json({
      data: created.map(serializeLedgerEntry),
      meta: {
        count: created.length,
        totalReceiptQty: created.reduce((sum, entry) => sum + decimalToNumber(entry.receiptQty), 0),
        totalIssueQty: created.reduce((sum, entry) => sum + decimalToNumber(entry.issueQty), 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

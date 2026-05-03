import { ItemType, Prisma, StockLedgerEntryType, type PurchaseGin, type PurchaseGinItem, type StockLedgerEntry } from '@prisma/client';
import { decimalToNumber, toNullableString } from '../shared/masterData';
import type { PurchaseGinListQuery } from './purchases.schemas';

const apiItemTypeMap = {
  [ItemType.RAW]: 'raw',
  [ItemType.FINISHED]: 'finished',
} as const;

const apiLedgerTypeMap = {
  [StockLedgerEntryType.PURCHASE]: 'purchase',
  [StockLedgerEntryType.ISSUE]: 'issue',
  [StockLedgerEntryType.PRODUCTION]: 'production',
  [StockLedgerEntryType.INVOICE]: 'invoice',
  [StockLedgerEntryType.RETURN]: 'return',
  [StockLedgerEntryType.TRANSFER]: 'transfer',
  [StockLedgerEntryType.SAMPLING]: 'sampling',
} as const;

type PurchaseGinListRecord = PurchaseGin & {
  _count: {
    items: number;
  };
};

type PurchaseGinDetailRecord = PurchaseGin & {
  items: PurchaseGinItem[];
};

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatGinNo(sequence: number) {
  return `GIN-${String(sequence).padStart(5, '0')}`;
}

export function toQtyDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

export function toAmountDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

export function serializePurchaseGinItem(item: PurchaseGinItem) {
  return {
    id: item.id,
    lineNo: item.lineNo,
    itemId: item.itemId,
    itemName: item.itemName,
    itemType: apiItemTypeMap[item.itemType],
    baseUnit: item.baseUnit,
    ulpQty: decimalToNumber(item.ulpQty),
    billQty: decimalToNumber(item.billQty),
    receivedQty: decimalToNumber(item.receivedQty),
    acceptedQty: decimalToNumber(item.acceptedQty),
    rejectedQty: decimalToNumber(item.rejectedQty),
    batchNo: item.batchNo,
    mfgDate: formatDateOnly(item.mfgDate),
    expiryDate: formatDateOnly(item.expiryDate),
    rate: decimalToNumber(item.rate),
    amount: decimalToNumber(item.amount),
    remarks: item.remarks ?? '',
  };
}

export function serializePurchaseGinList(record: PurchaseGinListRecord) {
  return {
    id: record.id,
    ginNo: record.ginNo,
    vendorId: record.vendorId,
    vendorName: record.vendorName,
    challanNo: record.challanNo,
    billNo: record.billNo,
    gateEntryNo: record.gateEntryNo,
    entryDate: formatDateOnly(record.entryDate),
    totalAmount: decimalToNumber(record.totalAmount),
    totalAcceptedQty: decimalToNumber(record.totalAcceptedQty),
    totalRejectedQty: decimalToNumber(record.totalRejectedQty),
    itemCount: record._count.items,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializePurchaseGinDetail(record: PurchaseGinDetailRecord) {
  return {
    id: record.id,
    ginNo: record.ginNo,
    vendorId: record.vendorId,
    vendorName: record.vendorName,
    challanNo: record.challanNo,
    challanDate: formatDateOnly(record.challanDate),
    billNo: record.billNo,
    billDate: formatDateOnly(record.billDate),
    gateEntryNo: record.gateEntryNo,
    entryDate: formatDateOnly(record.entryDate),
    preparedBy: record.preparedBy ?? '',
    sanctionedBy: record.sanctionedBy ?? '',
    authorizedSignatory: record.authorizedSignatory ?? '',
    totalAmount: decimalToNumber(record.totalAmount),
    totalAcceptedQty: decimalToNumber(record.totalAcceptedQty),
    totalRejectedQty: decimalToNumber(record.totalRejectedQty),
    items: record.items
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map(serializePurchaseGinItem),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function buildPurchaseGinWhere(companyId: string, query: PurchaseGinListQuery): Prisma.PurchaseGinWhereInput {
  return {
    companyId,
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          entryDate: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { ginNo: { contains: query.search, mode: 'insensitive' } },
            { vendorName: { contains: query.search, mode: 'insensitive' } },
            { billNo: { contains: query.search, mode: 'insensitive' } },
            { challanNo: { contains: query.search, mode: 'insensitive' } },
            { gateEntryNo: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function buildPurchaseGinOrderBy(sortBy: PurchaseGinListQuery['sortBy'], sortOrder: PurchaseGinListQuery['sortOrder']) {
  if (sortBy === 'ginNo') {
    return { ginSequence: sortOrder } as Prisma.PurchaseGinOrderByWithRelationInput;
  }

  return {
    [sortBy]: sortOrder,
  } as Prisma.PurchaseGinOrderByWithRelationInput;
}

export function serializeLedgerEntry(entry: StockLedgerEntry) {
  const receiptQty = decimalToNumber(entry.receiptQty);
  const issueQty = decimalToNumber(entry.issueQty);
  const rate = decimalToNumber(entry.rate);
  const source =
    entry.purchaseGinId
      ? {
          sourceModule: 'purchases',
          sourceId: entry.purchaseGinId,
          sourcePath: `/purchases/${entry.purchaseGinId}`,
          sourceLabel: 'Purchase GIN',
        }
      : entry.stockMovementId
        ? {
            sourceModule: 'stock-movement',
            sourceId: entry.stockMovementId,
            sourcePath: `/stock-movement/${entry.stockMovementId}`,
            sourceLabel: 'Stock Movement',
          }
        : entry.invoiceId
          ? {
              sourceModule: 'invoices',
              sourceId: entry.invoiceId,
              sourcePath: `/invoices/${entry.invoiceId}`,
              sourceLabel: 'Final Invoice',
            }
          : entry.productionBatchId
            ? {
                sourceModule: 'production',
                sourceId: entry.productionBatchId,
                sourcePath: `/production/${entry.productionBatchId}`,
                sourceLabel: 'Production Batch',
              }
            : {
                sourceModule: 'ledger',
                sourceId: '',
                sourcePath: '',
                sourceLabel: 'Manual Ledger Entry',
              };

  return {
    id: entry.id,
    itemId: entry.itemId,
    date: formatDateOnly(entry.date),
    referenceNo: entry.referenceNo,
    type: apiLedgerTypeMap[entry.type],
    particulars: entry.particulars,
    itemName: entry.itemName,
    itemCategory: entry.itemCategory,
    batchNo: entry.batchNo,
    mfgDate: formatDateOnly(entry.mfgDate),
    expiryDate: formatDateOnly(entry.expiryDate),
    receiptQty,
    issueQty,
    rate,
    remarks: entry.remarks ?? '',
    transactionValue: Number((Math.max(receiptQty, issueQty) * rate).toFixed(2)),
    purchaseGinId: entry.purchaseGinId ?? '',
    productionBatchId: entry.productionBatchId ?? '',
    stockMovementId: entry.stockMovementId ?? '',
    invoiceId: entry.invoiceId ?? '',
    sourceModule: source.sourceModule,
    sourceId: source.sourceId,
    sourcePath: source.sourcePath,
    sourceLabel: source.sourceLabel,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function buildLedgerCreateData(input: {
  companyId: string;
  purchaseGinId: string;
  itemId: string;
  date: string;
  referenceNo: string;
  particulars: string;
  itemName: string;
  itemCategory: ItemType;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  receiptQty: number;
  rate: number;
  remarks?: string;
}): Prisma.StockLedgerEntryUncheckedCreateInput {
  return {
    companyId: input.companyId,
    purchaseGinId: input.purchaseGinId,
    itemId: input.itemId,
    date: parseDateOnly(input.date),
    referenceNo: input.referenceNo,
    type: StockLedgerEntryType.PURCHASE,
    particulars: input.particulars,
    itemName: input.itemName,
    itemCategory: input.itemCategory,
    batchNo: input.batchNo,
    mfgDate: parseDateOnly(input.mfgDate),
    expiryDate: parseDateOnly(input.expiryDate),
    receiptQty: toQtyDecimal(input.receiptQty),
    issueQty: toQtyDecimal(0),
    rate: toAmountDecimal(input.rate),
    remarks: toNullableString(input.remarks),
  };
}

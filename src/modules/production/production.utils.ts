import {
  type MaterialRequisition,
  type MaterialRequisitionItem,
  Prisma,
  type ProductionBatch,
  type ProductionBmr,
  type StockMovement,
  type StockMovementItem,
} from '@prisma/client';
import { decimalToNumber, normalizeDateText, toNullableString } from '../shared/masterData';

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date | null | undefined) {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function toQtyDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

export function toAmountDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

export function toRateDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(4));
}

export function formatProductionNo(sequence: number) {
  return `PRD-${String(sequence).padStart(5, '0')}`;
}

export function formatMrsNo(sequence: number) {
  return `MRS-${String(sequence).padStart(5, '0')}`;
}

export function formatMovementNo(sequence: number) {
  return `MOV-${String(sequence).padStart(5, '0')}`;
}

export function ledgerBatchKey(itemId: string, batchNo: string) {
  return `${itemId}::${batchNo}`;
}

export type LedgerBatchSnapshot = {
  itemId: string;
  batchNo: string;
  availableQty: number;
  mfgDate: string;
  expiryDate: string;
  rate: number;
};

type LedgerQueryClient = Pick<Prisma.TransactionClient, 'stockLedgerEntry'>;

export async function loadLedgerBatchSnapshots(
  db: LedgerQueryClient,
  companyId: string,
  pairs: Array<{ itemId: string; batchNo: string }>,
) {
  if (!pairs.length) {
    return new Map<string, LedgerBatchSnapshot>();
  }

  const uniquePairs = Array.from(new Set(pairs.map((pair) => ledgerBatchKey(pair.itemId, pair.batchNo)))).map((key) => {
    const [itemId, batchNo] = key.split('::');
    return { itemId, batchNo };
  });

  const rows = await db.stockLedgerEntry.findMany({
    where: {
      companyId,
      OR: uniquePairs.map((pair) => ({
        itemId: pair.itemId,
        batchNo: pair.batchNo,
      })),
    },
    select: {
      itemId: true,
      batchNo: true,
      receiptQty: true,
      issueQty: true,
      mfgDate: true,
      expiryDate: true,
      rate: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const snapshotMap = new Map<string, LedgerBatchSnapshot>();

  rows.forEach((row) => {
    const key = ledgerBatchKey(row.itemId, row.batchNo);
    const previous = snapshotMap.get(key);
    snapshotMap.set(key, {
      itemId: row.itemId,
      batchNo: row.batchNo,
      availableQty: (previous?.availableQty ?? 0) + decimalToNumber(row.receiptQty) - decimalToNumber(row.issueQty),
      mfgDate: row.mfgDate ?? previous?.mfgDate ?? '',
      expiryDate: row.expiryDate ?? previous?.expiryDate ?? '',
      rate: decimalToNumber(row.rate) || previous?.rate || 0,
    });
  });

  return snapshotMap;
}

export type ProductionBatchRecord = ProductionBatch & {
  bmr: ProductionBmr | null;
};

export type MaterialRequisitionRecord = MaterialRequisition & {
  productionBatch: Pick<ProductionBatch, 'id' | 'batchNo' | 'productionNo'>;
  items: MaterialRequisitionItem[];
};

export type StockMovementRecord = StockMovement & {
  productionBatch: Pick<ProductionBatch, 'id' | 'batchNo' | 'productionNo'> | null;
  materialRequisition: (MaterialRequisition & {
    productionBatch: Pick<ProductionBatch, 'id' | 'batchNo' | 'productionNo'>;
    items: MaterialRequisitionItem[];
  }) | null;
  items: StockMovementItem[];
  qualityRequests: Array<{
    id: string;
    requestNo: string;
    status: string;
    itemName: string;
    batchNo: string;
  }>;
};

export type BmrPayload = {
  batchInfo: {
    productName: string;
    batchNo: string;
    batchSize: string;
    mfgDate: string;
    expDate: string;
  };
  rawMaterials: Array<{
    id: string;
    materialName: string;
    requiredQty: number;
    issuedQty: number;
    usedQty: number;
    returnedQty: number;
  }>;
  processSteps: Array<{
    id: string;
    stepName: string;
    startTime: string;
    endTime: string;
    operatorName: string;
    checkedBy: string;
    remarks: string;
  }>;
  sterilization: {
    date: string;
    quantity: number;
    reference: string;
  };
  packing: {
    packingType: string;
    quantity: number;
    doneBy: string;
  };
  labelling: {
    labelDetails: string;
    checkedBy: string;
  };
  finalOutput: {
    expectedQty: number;
    actualQty: number;
    rejectedQty: number;
  };
  qa: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    remarks: string;
    approvedBy: string;
  };
};

export function normalizeBmrPayload(batch: ProductionBatch, payload: BmrPayload): BmrPayload {
  return {
    ...payload,
    batchInfo: {
      productName: batch.productName,
      batchNo: batch.batchNo,
      batchSize: batch.batchSize,
      mfgDate: formatDateOnly(batch.mfgDate),
      expDate: formatDateOnly(batch.expDate),
    },
  };
}

export function serializeProductionBatch(record: ProductionBatchRecord) {
  return {
    id: record.id,
    itemId: record.itemId,
    productionNo: record.productionNo,
    batchNo: record.batchNo,
    productName: record.productName,
    batchSize: record.batchSize,
    status: record.status,
    startDate: formatDateOnly(record.startDate),
    mfgDate: formatDateOnly(record.mfgDate),
    expDate: formatDateOnly(record.expDate),
    expectedQty: record.expectedQty ? decimalToNumber(record.expectedQty) : 0,
    actualQty: record.actualQty ? decimalToNumber(record.actualQty) : 0,
    rejectedQty: record.rejectedQty ? decimalToNumber(record.rejectedQty) : 0,
    bmrStatus: record.bmr?.status ?? null,
    qaApprovedBy: record.qaApprovedBy ?? '',
    qaRemarks: record.qaRemarks ?? '',
    qaDecidedAt: record.qaDecidedAt?.toISOString() ?? '',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializeProductionBmr(record: ProductionBmr | null) {
  if (!record) return null;

  return {
    id: record.id,
    status: record.status,
    data: record.payload,
    submittedAt: record.submittedAt?.toISOString() ?? '',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeMaterialRequisitionItem(item: MaterialRequisitionItem) {
  const qtyRequested = decimalToNumber(item.qtyRequested);
  const qtyIssued = decimalToNumber(item.qtyIssued);

  return {
    id: item.id,
    itemId: item.itemId,
    itemName: item.itemName,
    unit: item.unit,
    qtyRequested,
    qtyIssued,
    remainingQty: Math.max(0, Number((qtyRequested - qtyIssued).toFixed(3))),
    remarks: item.remarks ?? '',
  };
}

export function serializeMaterialRequisition(record: MaterialRequisitionRecord) {
  return {
    id: record.id,
    mrsNo: record.mrsNo,
    date: formatDateOnly(record.date),
    department: record.department,
    productionBatchId: record.productionBatchId,
    productionBatchNo: record.productionBatch.batchNo,
    productionNo: record.productionBatch.productionNo,
    requisitionBy: record.requisitionBy,
    approvedBy: record.approvedBy ?? '',
    approvedAt: record.approvedAt?.toISOString() ?? '',
    status: record.status.toLowerCase(),
    items: record.items
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map(serializeMaterialRequisitionItem),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildMovementIssueMap(record: StockMovementRecord) {
  const requisitionItems = record.materialRequisition?.items ?? [];
  return new Map(
    requisitionItems.map((item) => [
      item.itemId,
      {
        requestedQty: decimalToNumber(item.qtyRequested),
        issuedQty: decimalToNumber(item.qtyIssued),
      },
    ]),
  );
}

function serializeStockMovementItem(
  item: StockMovementItem,
  movementType: StockMovement['type'],
  issueSummary: Map<string, { requestedQty: number; issuedQty: number }>,
) {
  const requestSummary = issueSummary.get(item.itemId);
  const quantity = decimalToNumber(item.quantity);
  const issuedQty = requestSummary?.issuedQty ?? 0;
  const requestedQty = requestSummary?.requestedQty ?? (item.requestedQty ? decimalToNumber(item.requestedQty) : 0);

  return {
    id: item.id,
    itemId: item.itemId,
    itemName: item.itemName,
    unit: item.unit,
    batchNo: item.batchNo,
    quantity,
    availableQty: decimalToNumber(item.availableQty),
    requestedQty,
    issuedQty: movementType === 'ISSUE' ? issuedQty : 0,
    remainingQty:
      movementType === 'ISSUE' ? Math.max(0, Number((requestedQty - issuedQty).toFixed(3))) : undefined,
    mfgDate: item.mfgDate ?? '',
    expiryDate: item.expiryDate ?? '',
    remarks: item.remarks ?? '',
  };
}

export function serializeStockMovement(record: StockMovementRecord) {
  const issueSummary = buildMovementIssueMap(record);
  const relatedBatch = record.productionBatch ?? record.materialRequisition?.productionBatch ?? null;
  const relatedMrs = record.materialRequisition ?? null;
  const items = record.items
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((item) => serializeStockMovementItem(item, record.type, issueSummary));
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const firstItem = items[0];

  return {
    id: record.id,
    movementNo: record.movementNo,
    date: formatDateOnly(record.date),
    type: record.type.toLowerCase(),
    mrsId: relatedMrs?.id ?? '',
    mrsNo: relatedMrs?.mrsNo ?? '',
    productionBatchId: relatedBatch?.id ?? '',
    productionBatchNo: relatedBatch?.batchNo ?? '',
    productionNo: relatedBatch?.productionNo ?? '',
    itemName: firstItem?.itemName ?? '',
    batchNo: firstItem?.batchNo ?? '',
    quantity: totalQty,
    items,
    availableQty: firstItem?.availableQty ?? 0,
    fromLocation: record.fromLocation ?? '',
    toLocation: record.toLocation ?? '',
    mfgDate: firstItem?.mfgDate ?? '',
    expiryDate: firstItem?.expiryDate ?? '',
    issuedBy: record.issuedBy ?? '',
    sampleDrawnBy: record.sampleDrawnBy ?? '',
    remarks: record.remarks ?? '',
    qualityRequests: record.qualityRequests.map((qualityRequest) => ({
      id: qualityRequest.id,
      requestNo: qualityRequest.requestNo,
      status: qualityRequest.status.toLowerCase(),
      itemName: qualityRequest.itemName,
      batchNo: qualityRequest.batchNo,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function buildLedgerEntryData(input: {
  companyId: string;
  itemId: string;
  date: string;
  referenceNo: string;
  type: 'PURCHASE' | 'ISSUE' | 'PRODUCTION' | 'INVOICE' | 'RETURN' | 'TRANSFER' | 'SAMPLING';
  particulars: string;
  itemName: string;
  itemCategory: 'RAW' | 'FINISHED';
  batchNo: string;
  mfgDate?: string | null;
  expiryDate?: string | null;
  receiptQty?: number;
  issueQty?: number;
  rate?: number;
  remarks?: string;
  productionBatchId?: string;
  stockMovementId?: string;
  invoiceId?: string;
}): Prisma.StockLedgerEntryUncheckedCreateInput {
  return {
    companyId: input.companyId,
    itemId: input.itemId,
    productionBatchId: input.productionBatchId ?? null,
    stockMovementId: input.stockMovementId ?? null,
    invoiceId: input.invoiceId ?? null,
    date: parseDateOnly(input.date),
    referenceNo: input.referenceNo,
    type: input.type,
    particulars: input.particulars,
    itemName: input.itemName,
    itemCategory: input.itemCategory,
    batchNo: input.batchNo,
    mfgDate: normalizeDateText(input.mfgDate),
    expiryDate: normalizeDateText(input.expiryDate),
    receiptQty: toQtyDecimal(input.receiptQty ?? 0),
    issueQty: toQtyDecimal(input.issueQty ?? 0),
    rate: toRateDecimal(input.rate ?? 0),
    remarks: toNullableString(input.remarks),
  };
}

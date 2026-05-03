import { ItemType, type Item, type ProductionBatch, type QualityRequest, type StockMovement } from '@prisma/client';
import { decimalToNumber } from '../shared/masterData';
import { formatDateOnly } from '../production/production.utils';

export function formatQualityRequestNo(sequence: number) {
  return `QREQ-${String(sequence).padStart(5, '0')}`;
}

const toLowerCaseValue = (value: string | null | undefined) => value?.toLowerCase() ?? undefined;

type QualityRequestRecord = QualityRequest & {
  item?: Pick<Item, 'itemType'> | null;
  stockMovement?: Pick<StockMovement, 'movementNo'> | null;
  productionBatch?: Pick<ProductionBatch, 'batchNo' | 'productionNo'> | null;
};

export function serializeQualityRequest(record: QualityRequestRecord) {
  return {
    id: record.id,
    sourceType: toLowerCaseValue(record.sourceType),
    stockMovementId: record.stockMovementId ?? '',
    stockMovementItemId: record.stockMovementItemId ?? '',
    stockMovementNo: record.stockMovement?.movementNo ?? '',
    itemId: record.itemId ?? '',
    itemType: record.item ? (record.item.itemType === ItemType.RAW ? 'raw' : 'finished') : undefined,
    productionBatchId: record.productionBatchId ?? '',
    productionBatchNo: record.productionBatch?.batchNo ?? '',
    productionNo: record.productionBatch?.productionNo ?? '',
    requestNo: record.requestNo,
    date: formatDateOnly(record.date),
    itemName: record.itemName,
    batchNo: record.batchNo,
    quantity: record.quantity === null ? undefined : decimalToNumber(record.quantity),
    issueType: record.issueType.toLowerCase(),
    description: record.description,
    remarks: record.remarks ?? '',
    requestedBy: record.requestedBy,
    status: record.status.toLowerCase(),
    approvedBy: record.approvedBy ?? '',
    approvalRemarks: record.approvalRemarks ?? '',
    testParameters: record.testParameters ?? '',
    observations: record.observations ?? '',
    testResult: toLowerCaseValue(record.testResult),
    attachments: record.attachments ?? [],
    closureDecision: toLowerCaseValue(record.closureDecision),
    closureRemarks: record.closureRemarks ?? '',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

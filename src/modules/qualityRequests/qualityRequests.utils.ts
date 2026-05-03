import { type QualityRequest } from '@prisma/client';
import { decimalToNumber } from '../shared/masterData';
import { formatDateOnly } from '../production/production.utils';

export function formatQualityRequestNo(sequence: number) {
  return `QREQ-${String(sequence).padStart(5, '0')}`;
}

const toLowerCaseValue = (value: string | null | undefined) => value?.toLowerCase() ?? undefined;

export function serializeQualityRequest(record: QualityRequest) {
  return {
    id: record.id,
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

import { z } from 'zod';
import { optionalTrimmedString, requiredTrimmedString } from '../shared/masterData';

const dateStringSchema = z
  .string({ required_error: 'Required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

const optionalQuantitySchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(0, 'Quantity cannot be negative').optional(),
);

const attachmentSchema = z.string().trim().min(1, 'Attachment name is required').max(255);

export const qualityRequestListQuerySchema = z.object({
  search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(150).default('')),
  status: z.enum(['all', 'pending', 'approved', 'under_testing', 'completed', 'closed']).default('all'),
  sourceType: z.enum(['all', 'sampling']).default('all'),
  stockMovementId: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(100).default(''),
  ),
});

export const qualityRequestCreateSchema = z.object({
  requestNo: optionalTrimmedString(120),
  date: dateStringSchema,
  itemName: requiredTrimmedString(200, 'Item name is required'),
  batchNo: requiredTrimmedString(120, 'Batch no is required'),
  quantity: optionalQuantitySchema,
  issueType: z.enum(['defect', 'testing', 'complaint']),
  description: requiredTrimmedString(2000, 'Description is required'),
  remarks: optionalTrimmedString(2000),
  requestedBy: optionalTrimmedString(120),
});

export const qualityRequestApproveSchema = z.object({
  approvedBy: optionalTrimmedString(120),
  approvalRemarks: optionalTrimmedString(1000),
});

export const qualityRequestReportSchema = z.object({
  testParameters: requiredTrimmedString(2000, 'Test parameters are required'),
  observations: requiredTrimmedString(3000, 'Observations are required'),
  result: z.enum(['pass', 'fail']),
  attachments: z.array(attachmentSchema).max(20, 'Maximum 20 attachments are allowed').default([]),
});

export const qualityRequestCloseSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  remarks: optionalTrimmedString(2000),
});

export type QualityRequestCreateInput = z.infer<typeof qualityRequestCreateSchema>;
export type QualityRequestListQuery = z.infer<typeof qualityRequestListQuerySchema>;

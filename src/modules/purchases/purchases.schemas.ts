import { z } from 'zod';
import {
  defaultSortOrder,
  optionalDateTextSchema,
  optionalTrimmedString,
  parsePaginateFlag,
  requiredTrimmedString,
  toComparableIsoDate,
} from '../shared/masterData';

const dateStringSchema = z
  .string({ required_error: 'Required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

const optionalDateFilterSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') return value;
    return value.trim();
  },
  z.union([z.literal(''), dateStringSchema]).default(''),
);

const quantitySchema = z.coerce.number().min(0, 'Cannot be negative');
const amountSchema = z.coerce.number().min(0, 'Cannot be negative');
const taxRateSchema = z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100');

export const purchaseGinItemSchema = z
  .object({
    itemId: z.string().trim().min(1, 'Item is required'),
    ulpQty: quantitySchema,
    billQty: quantitySchema,
    receivedQty: quantitySchema,
    acceptedQty: quantitySchema,
    rejectedQty: quantitySchema,
    batchNo: requiredTrimmedString(100, 'Batch is required'),
    mfgDate: optionalDateTextSchema(),
    expiryDate: optionalDateTextSchema(),
    rate: amountSchema,
    taxableValue: amountSchema,
    cgstRate: taxRateSchema,
    sgstRate: taxRateSchema,
    igstRate: taxRateSchema,
    remarks: optionalTrimmedString(500),
  })
  .superRefine((value, ctx) => {
    const qtyDelta = Math.abs((value.acceptedQty + value.rejectedQty) - value.receivedQty);
    if (qtyDelta > 0.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acceptedQty'],
        message: 'Accepted + Rejected must equal Received',
      });
    }

    const comparableMfgDate = toComparableIsoDate(value.mfgDate);
    const comparableExpiryDate = toComparableIsoDate(value.expiryDate);
    if (comparableMfgDate && comparableExpiryDate && comparableExpiryDate < comparableMfgDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: 'Expiry date cannot be before MFG date',
      });
    }

    if (value.igstRate > 0 && (value.cgstRate > 0 || value.sgstRate > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['igstRate'],
        message: 'Use IGST or CGST/SGST for a line, not both',
      });
    }
  });

export const purchaseGinCreateSchema = z.object({
  vendorId: z.string().trim().min(1, 'Vendor is required'),
  challanNo: requiredTrimmedString(100, 'Challan number is required'),
  challanDate: dateStringSchema,
  billNo: requiredTrimmedString(100, 'Bill number is required'),
  billDate: dateStringSchema,
  gateEntryNo: requiredTrimmedString(100, 'Gate entry number is required'),
  entryDate: dateStringSchema,
  items: z.array(purchaseGinItemSchema).min(1, 'At least one item is required'),
  preparedBy: optionalTrimmedString(100),
  sanctionedBy: optionalTrimmedString(100),
  authorizedSignatory: optionalTrimmedString(100),
});

export const purchaseGinListQuerySchema = z
  .object({
    search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(150).default('')),
    vendorId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(50).default(''),
    ),
    dateFrom: optionalDateFilterSchema,
    dateTo: optionalDateFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['entryDate', 'createdAt', 'ginNo', 'vendorName', 'totalAmount']).default('entryDate'),
    sortOrder: z.preprocess(defaultSortOrder, z.enum(['asc', 'desc']).default('desc')),
    paginate: z.preprocess(parsePaginateFlag, z.boolean().default(true)),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'Date to cannot be before date from',
      });
    }
  });

export type PurchaseGinCreateInput = z.infer<typeof purchaseGinCreateSchema>;
export type PurchaseGinListQuery = z.infer<typeof purchaseGinListQuerySchema>;

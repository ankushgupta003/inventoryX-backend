import { z } from 'zod';
import {
  defaultSortOrder,
  optionalDateTextSchema,
  optionalTrimmedString,
  parsePaginateFlag,
  requiredTrimmedString,
  toComparableIsoDate,
} from '../shared/masterData';

export const ledgerListQuerySchema = z
  .object({
    search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120).default('')),
    itemId: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(100).default('')),
    batchNo: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(100).default('')),
    dateFrom: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(10).default('')),
    dateTo: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(10).default('')),
    type: z.enum(['all', 'purchase', 'issue', 'production', 'invoice', 'return', 'transfer', 'sampling']).default('all'),
    itemCategory: z.preprocess(
      (value) => (typeof value === 'string' ? (value.trim().toUpperCase() === 'ALL' ? 'all' : value.trim().toUpperCase()) : value),
      z.enum(['all', 'RAW', 'FINISHED']).default('all'),
    ),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(5000).default(50),
    sortOrder: z.preprocess(defaultSortOrder, z.enum(['asc', 'desc']).default('asc')),
    paginate: z.preprocess(parsePaginateFlag, z.boolean().default(true)),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(value.dateFrom)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateFrom'], message: 'Invalid date' });
    }
    if (value.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(value.dateTo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'Invalid date' });
    }
    if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'Date to cannot be before date from' });
    }
  });

export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

const dateStringSchema = z
  .string({ required_error: 'Required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

const qtySchema = z.coerce.number().min(0, 'Cannot be negative');
const amountSchema = z.coerce.number().min(0, 'Cannot be negative');

const ledgerEntryCreateSchema = z
  .object({
    itemId: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(100).default('')),
    itemName: optionalTrimmedString(200),
    date: dateStringSchema,
    referenceNo: requiredTrimmedString(120, 'Reference no is required'),
    type: z.enum(['purchase', 'issue', 'production', 'invoice', 'return', 'transfer', 'sampling']),
    particulars: requiredTrimmedString(200, 'Particulars are required'),
    itemCategory: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      z.enum(['RAW', 'FINISHED']),
    ),
    batchNo: requiredTrimmedString(120, 'Batch no is required'),
    mfgDate: optionalDateTextSchema(),
    expiryDate: optionalDateTextSchema(),
    receiptQty: qtySchema.default(0),
    issueQty: qtySchema.default(0),
    rate: amountSchema.default(0),
    remarks: optionalTrimmedString(1000),
    productionBatchId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    stockMovementId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
  })
  .superRefine((value, ctx) => {
    if (!value.itemId && !value.itemName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemId'],
        message: 'Item id or item name is required',
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
  });

export const ledgerCreateSchema = z.object({
  entries: z.array(ledgerEntryCreateSchema).min(1, 'At least one ledger entry is required'),
});

export type LedgerCreateInput = z.infer<typeof ledgerCreateSchema>;

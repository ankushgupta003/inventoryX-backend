import { z } from 'zod';
import { optionalTrimmedString, requiredTrimmedString } from '../shared/masterData';

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

const quantitySchema = z.coerce.number().gt(0, 'Quantity must be greater than 0');
const amountSchema = z.coerce.number().min(0, 'Cannot be negative');

export const proformaInvoiceItemInputSchema = z.object({
  id: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(100).optional()),
  itemId: z.string().trim().min(1, 'Item is required'),
  quantity: quantitySchema,
  rate: amountSchema,
  remarks: optionalTrimmedString(1000),
});

export const proformaInvoiceUpsertSchema = z.object({
  date: dateStringSchema,
  customerId: z.string().trim().min(1, 'Customer is required'),
  items: z.array(proformaInvoiceItemInputSchema).min(1, 'At least one item is required'),
});

export const proformaInvoiceListQuerySchema = z
  .object({
    search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120).default('')),
    status: z.enum(['all', 'pending', 'partial', 'completed', 'closed']).default('all'),
    customerId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    dateFrom: optionalDateFilterSchema,
    dateTo: optionalDateFilterSchema,
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

export type ProformaInvoiceUpsertInput = z.infer<typeof proformaInvoiceUpsertSchema>;
export type ProformaInvoiceListQuery = z.infer<typeof proformaInvoiceListQuerySchema>;

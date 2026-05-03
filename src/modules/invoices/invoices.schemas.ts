import { z } from 'zod';

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

const quantitySchema = z.coerce.number().gt(0, 'Invoice qty must be greater than 0');
const amountSchema = z.coerce.number().min(0, 'Cannot be negative');

export const invoiceCreateLineSchema = z.object({
  proformaInvoiceItemId: z.string().trim().min(1, 'PI line reference is required'),
  itemId: z.string().trim().min(1, 'Item is required'),
  batchNo: z.string().trim().min(1, 'Batch is required'),
  invoiceQty: quantitySchema,
  rate: amountSchema,
  taxPercent: amountSchema,
});

export const invoiceCreateSchema = z.object({
  date: dateStringSchema,
  proformaInvoiceId: z.string().trim().min(1, 'PI selection is required'),
  items: z.array(invoiceCreateLineSchema).min(1, 'At least one invoice line is required'),
});

export const invoiceListQuerySchema = z
  .object({
    search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120).default('')),
    proformaInvoiceId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    customerId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    status: z.enum(['all', 'partial', 'completed']).default('all'),
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

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

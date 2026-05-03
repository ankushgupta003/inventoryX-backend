import { z } from 'zod';
import {
  defaultSortOrder,
  optionalTrimmedString,
  optionalUppercaseFreeform,
  parsePaginateFlag,
  requiredTrimmedString,
  statusFilterSchema,
} from '../shared/masterData';

export const ITEM_BASE_UNITS = [
  'kg',
  'pcs',
  'nos',
  'ltr',
  'mtr',
  'set',
  'ton',
  'box',
  'bundle',
  'roll',
  'bag',
] as const;

export const itemTypeSchema = z.enum(['raw', 'finished']);

export const itemUpsertSchema = z.object({
  storeName: requiredTrimmedString(100, 'Store name is required'),
  tallyName: requiredTrimmedString(100, 'Tally name is required'),
  sku: optionalUppercaseFreeform(50),
  itemType: itemTypeSchema,
  category: optionalTrimmedString(50),
  baseUnit: z.enum(ITEM_BASE_UNITS),
  hsnCode: optionalUppercaseFreeform(20),
  gstRate: z.coerce.number().min(0, 'Min 0').max(100, 'Max 100'),
  isActive: z.boolean(),
});

export const itemStatusSchema = z.object({
  isActive: z.boolean().optional(),
});

export const itemListQuerySchema = z.object({
  search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(150).default('')),
  status: statusFilterSchema.default('all'),
  itemType: z.enum(['all', 'raw', 'finished']).default('all'),
  category: optionalTrimmedString(50).default(''),
  baseUnit: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value !== 'string') return value;
      return value.trim();
    },
    z.string().default(''),
  ),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['storeName', 'tallyName', 'createdAt', 'updatedAt']).default('storeName'),
  sortOrder: z.preprocess(defaultSortOrder, z.enum(['asc', 'desc']).default('asc')),
  paginate: z.preprocess(parsePaginateFlag, z.boolean().default(true)),
});

export type ItemUpsertInput = z.infer<typeof itemUpsertSchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

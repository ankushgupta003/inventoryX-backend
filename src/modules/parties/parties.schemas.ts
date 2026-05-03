import { z } from 'zod';
import {
  defaultSortOrder,
  optionalEmailString,
  optionalPhoneString,
  optionalTrimmedString,
  optionalUppercaseString,
  parsePaginateFlag,
  requiredTrimmedString,
  statusFilterSchema,
} from '../shared/masterData';

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const partyTypeSchema = z.enum(['vendor', 'customer', 'both']);

export const partyUpsertSchema = z.object({
  name: requiredTrimmedString(150, 'Party name is required'),
  partyType: partyTypeSchema,
  contactPerson: optionalTrimmedString(100),
  phone: optionalPhoneString(),
  altPhone: optionalPhoneString(),
  email: optionalEmailString(),
  address1: optionalTrimmedString(250),
  address2: optionalTrimmedString(250),
  city: optionalTrimmedString(100),
  state: optionalTrimmedString(100),
  pincode: optionalTrimmedString(10),
  gstNumber: optionalUppercaseString(15, 'Invalid GST format (e.g. 27AABCU9603R1ZM)', gstRegex),
  panNumber: optionalUppercaseString(10, 'Invalid PAN format', panRegex),
  openingBalance: z.coerce.number().min(0).default(0),
  creditLimit: z.coerce.number().min(0).default(0),
  remarks: optionalTrimmedString(500),
  isActive: z.boolean(),
});

export const partyStatusSchema = z.object({
  isActive: z.boolean().optional(),
});

export const partyListQuerySchema = z.object({
  search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(150).default('')),
  status: statusFilterSchema.default('all'),
  partyType: z.enum(['all', 'vendor', 'customer', 'both']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.preprocess(defaultSortOrder, z.enum(['asc', 'desc']).default('asc')),
  paginate: z.preprocess(parsePaginateFlag, z.boolean().default(true)),
});

export type PartyUpsertInput = z.infer<typeof partyUpsertSchema>;
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;

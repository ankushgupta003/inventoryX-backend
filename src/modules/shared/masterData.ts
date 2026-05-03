import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors/AppError';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim();
}

function toOptionalTrimmedString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function uppercaseOptionalString(value: unknown) {
  const trimmed = toOptionalTrimmedString(value);
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
}

export function requiredTrimmedString(max: number, message: string) {
  return z.string({ required_error: message }).trim().min(1, message).max(max);
}

export function optionalTrimmedString(max: number) {
  return z.preprocess(toOptionalTrimmedString, z.string().max(max).optional());
}

export function optionalPhoneString() {
  return z.preprocess(
    toOptionalTrimmedString,
    z
      .string()
      .max(15)
      .regex(/^[0-9]{10,15}$/, 'Phone must be 10-15 digits')
      .optional(),
  );
}

export function optionalEmailString() {
  return z.preprocess(
    (value) => {
      const trimmed = toOptionalTrimmedString(value);
      return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
    },
    z.string().email('Invalid email format').max(255).optional(),
  );
}

export function optionalUppercaseString(max: number, message: string, pattern?: RegExp) {
  return z.preprocess(
    uppercaseOptionalString,
    z
      .string()
      .max(max)
      .optional()
      .refine((value) => !value || !pattern || pattern.test(value), message),
  );
}

export function optionalUppercaseFreeform(max: number) {
  return z.preprocess(uppercaseOptionalString, z.string().max(max).optional());
}

export function normalizeLookupValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function toNullableString(value?: string) {
  return value ?? null;
}

export function decimalToNumber(value: Prisma.Decimal | string | number) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

export function mapUniqueConstraintError(
  error: unknown,
  fieldMessages: Record<string, string>,
  fallbackMessage: string,
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    const match = Object.entries(fieldMessages).find(([field]) => target.includes(field));
    throw new AppError(409, match?.[1] ?? fallbackMessage);
  }

  throw error;
}

export function parsePaginateFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return value;
}

export function defaultSortOrder(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

export const statusFilterSchema = z.enum(['all', 'active', 'inactive']);

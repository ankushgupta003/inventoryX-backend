import { ItemType, Prisma, type Item } from '@prisma/client';
import {
  decimalToNumber,
  normalizeLookupValue,
  toNullableString,
} from '../shared/masterData';
import type { ItemListQuery, ItemUpsertInput } from './items.schemas';

const itemTypeMap = {
  raw: ItemType.RAW,
  finished: ItemType.FINISHED,
} as const;

const apiItemTypeMap = {
  [ItemType.RAW]: 'raw',
  [ItemType.FINISHED]: 'finished',
} as const;

export function toItemType(value: keyof typeof itemTypeMap) {
  return itemTypeMap[value];
}

export function serializeItem(item: Item) {
  return {
    id: item.id,
    storeName: item.storeName,
    tallyName: item.tallyName,
    sku: item.sku ?? '',
    itemType: apiItemTypeMap[item.itemType],
    category: item.category ?? '',
    baseUnit: item.baseUnit,
    hsnCode: item.hsnCode ?? '',
    gstRate: decimalToNumber(item.gstRate),
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function buildItemCreateData(companyId: string, payload: ItemUpsertInput): Prisma.ItemUncheckedCreateInput {
  return {
    companyId,
    storeName: payload.storeName.trim(),
    storeNameNormalized: normalizeLookupValue(payload.storeName),
    tallyName: payload.tallyName.trim(),
    tallyNameNormalized: normalizeLookupValue(payload.tallyName),
    sku: toNullableString(payload.sku),
    skuNormalized: payload.sku ? payload.sku.toLowerCase() : null,
    itemType: toItemType(payload.itemType),
    category: toNullableString(payload.category),
    baseUnit: payload.baseUnit,
    hsnCode: toNullableString(payload.hsnCode),
    gstRate: new Prisma.Decimal(payload.gstRate.toFixed(2)),
    isActive: payload.isActive,
  };
}

export function buildItemWhere(companyId: string, query: ItemListQuery): Prisma.ItemWhereInput {
  return {
    companyId,
    ...(query.status === 'active' ? { isActive: true } : {}),
    ...(query.status === 'inactive' ? { isActive: false } : {}),
    ...(query.itemType !== 'all' ? { itemType: toItemType(query.itemType) } : {}),
    ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
    ...(query.baseUnit ? { baseUnit: query.baseUnit } : {}),
    ...(query.search
      ? {
          OR: [
            { storeName: { contains: query.search, mode: 'insensitive' } },
            { tallyName: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
            { hsnCode: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function buildItemOrderBy(sortBy: ItemListQuery['sortBy'], sortOrder: ItemListQuery['sortOrder']) {
  if (sortBy === 'storeName') {
    return { storeNameNormalized: sortOrder } as Prisma.ItemOrderByWithRelationInput;
  }

  if (sortBy === 'tallyName') {
    return { tallyNameNormalized: sortOrder } as Prisma.ItemOrderByWithRelationInput;
  }

  return {
    [sortBy]: sortOrder,
  } as Prisma.ItemOrderByWithRelationInput;
}

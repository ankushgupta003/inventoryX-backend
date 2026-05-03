import { PartyType, Prisma, type Party } from '@prisma/client';
import {
  decimalToNumber,
  normalizeLookupValue,
  toNullableString,
} from '../shared/masterData';
import type { PartyListQuery, PartyUpsertInput } from './parties.schemas';

const partyTypeMap = {
  vendor: PartyType.VENDOR,
  customer: PartyType.CUSTOMER,
  both: PartyType.BOTH,
} as const;

const apiPartyTypeMap = {
  [PartyType.VENDOR]: 'vendor',
  [PartyType.CUSTOMER]: 'customer',
  [PartyType.BOTH]: 'both',
} as const;

const partySortMap = {
  name: { nameNormalized: 'asc' as const },
  createdAt: { createdAt: 'asc' as const },
  updatedAt: { updatedAt: 'asc' as const },
} satisfies Record<string, Prisma.PartyOrderByWithRelationInput>;

export function toPartyType(value: keyof typeof partyTypeMap) {
  return partyTypeMap[value];
}

export function serializeParty(party: Party) {
  return {
    id: party.id,
    name: party.name,
    partyType: apiPartyTypeMap[party.partyType],
    contactPerson: party.contactPerson ?? '',
    phone: party.phone ?? '',
    altPhone: party.altPhone ?? '',
    email: party.email ?? '',
    address1: party.address1 ?? '',
    address2: party.address2 ?? '',
    city: party.city ?? '',
    state: party.state ?? '',
    pincode: party.pincode ?? '',
    gstNumber: party.gstNumber ?? '',
    panNumber: party.panNumber ?? '',
    openingBalance: decimalToNumber(party.openingBalance),
    creditLimit: decimalToNumber(party.creditLimit),
    remarks: party.remarks ?? '',
    isActive: party.isActive,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}

export function buildPartyCreateData(companyId: string, payload: PartyUpsertInput): Prisma.PartyUncheckedCreateInput {
  return {
    companyId,
    name: payload.name.trim(),
    nameNormalized: normalizeLookupValue(payload.name),
    partyType: toPartyType(payload.partyType),
    contactPerson: toNullableString(payload.contactPerson),
    phone: toNullableString(payload.phone),
    altPhone: toNullableString(payload.altPhone),
    email: toNullableString(payload.email),
    address1: toNullableString(payload.address1),
    address2: toNullableString(payload.address2),
    city: toNullableString(payload.city),
    state: toNullableString(payload.state),
    pincode: toNullableString(payload.pincode),
    gstNumber: toNullableString(payload.gstNumber),
    gstNumberNormalized: payload.gstNumber ?? null,
    panNumber: toNullableString(payload.panNumber),
    panNumberNormalized: payload.panNumber ?? null,
    openingBalance: new Prisma.Decimal(payload.openingBalance.toFixed(2)),
    creditLimit: new Prisma.Decimal(payload.creditLimit.toFixed(2)),
    remarks: toNullableString(payload.remarks),
    isActive: payload.isActive,
  };
}

export function buildPartyWhere(companyId: string, query: PartyListQuery): Prisma.PartyWhereInput {
  return {
    companyId,
    ...(query.status === 'active' ? { isActive: true } : {}),
    ...(query.status === 'inactive' ? { isActive: false } : {}),
    ...(query.partyType !== 'all' ? { partyType: toPartyType(query.partyType) } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { contactPerson: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
            { gstNumber: { contains: query.search, mode: 'insensitive' } },
            { city: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function buildPartyOrderBy(sortBy: PartyListQuery['sortBy'], sortOrder: PartyListQuery['sortOrder']) {
  if (sortBy === 'name') {
    return { nameNormalized: sortOrder };
  }

  return {
    [sortBy]: sortOrder,
  } as Prisma.PartyOrderByWithRelationInput;
}

export function createPartySummaryResponse(summary: {
  total: number;
  active: number;
  inactive: number;
  vendors: number;
  customers: number;
  both: number;
}) {
  return summary;
}

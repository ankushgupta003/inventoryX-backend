import path from 'path';
import dotenv from 'dotenv';
import { AccountType, ItemType, Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { buildLedgerEntryData } from '../src/modules/production/production.utils';
import { normalizeLookupValue } from '../src/modules/shared/masterData';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

const demoCompany = {
  name: process.env.PRODUCTION_FLOW_COMPANY_NAME ?? 'InventoryX Production Demo',
  code: process.env.PRODUCTION_FLOW_COMPANY_CODE ?? 'INVX-PROD-DEMO',
  email: process.env.PRODUCTION_FLOW_COMPANY_EMAIL ?? 'production.demo@inventoryx.local',
  phone: process.env.PRODUCTION_FLOW_COMPANY_PHONE ?? '9999999999',
  address: process.env.PRODUCTION_FLOW_COMPANY_ADDRESS ?? 'Plot 21, Industrial Area, Mumbai',
};

const demoAdmin = {
  fullName: process.env.PRODUCTION_FLOW_ADMIN_NAME ?? 'Production Demo Admin',
  email: process.env.PRODUCTION_FLOW_ADMIN_EMAIL ?? 'production.admin@inventoryx.local',
  password: process.env.PRODUCTION_FLOW_ADMIN_PASSWORD ?? 'ChangeMe123!',
};

type SeedItem = {
  key: string;
  storeName: string;
  tallyName: string;
  sku: string;
  itemType: ItemType;
  category: string;
  baseUnit: string;
  hsnCode: string;
  gstRate: number;
};

type SeedLedgerReceipt = {
  referenceNo: string;
  itemKey: string;
  date: string;
  particulars: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  receiptQty: number;
  rate: number;
  remarks: string;
};

type SeedCustomer = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  remarks: string;
};

const seedItems: SeedItem[] = [
  {
    key: 'purified-water',
    storeName: 'Purified Water',
    tallyName: 'PURIFIED WATER',
    sku: 'RAW-PW-001',
    itemType: ItemType.RAW,
    category: 'Solvent',
    baseUnit: 'ltr',
    hsnCode: '220190',
    gstRate: 18,
  },
  {
    key: 'isopropyl-alcohol',
    storeName: 'Isopropyl Alcohol',
    tallyName: 'ISOPROPYL ALCOHOL',
    sku: 'RAW-IPA-001',
    itemType: ItemType.RAW,
    category: 'Solvent',
    baseUnit: 'ltr',
    hsnCode: '290512',
    gstRate: 18,
  },
  {
    key: 'glycerine',
    storeName: 'Glycerine',
    tallyName: 'GLYCERINE',
    sku: 'RAW-GLY-001',
    itemType: ItemType.RAW,
    category: 'Humectant',
    baseUnit: 'kg',
    hsnCode: '290545',
    gstRate: 18,
  },
  {
    key: 'carbomer',
    storeName: 'Carbomer',
    tallyName: 'CARBOMER',
    sku: 'RAW-CRB-001',
    itemType: ItemType.RAW,
    category: 'Binder',
    baseUnit: 'kg',
    hsnCode: '390690',
    gstRate: 18,
  },
  {
    key: 'perfume-base',
    storeName: 'Perfume Base',
    tallyName: 'PERFUME BASE',
    sku: 'RAW-PFB-001',
    itemType: ItemType.RAW,
    category: 'Additive',
    baseUnit: 'ltr',
    hsnCode: '330290',
    gstRate: 18,
  },
  {
    key: 'pet-bottle-100',
    storeName: 'PET Bottle 100ml',
    tallyName: 'PET BOTTLE 100ML',
    sku: 'RAW-PET-100',
    itemType: ItemType.RAW,
    category: 'Packaging',
    baseUnit: 'pcs',
    hsnCode: '392330',
    gstRate: 18,
  },
  {
    key: 'flip-top-cap-100',
    storeName: 'Flip Top Cap 100ml',
    tallyName: 'FLIP TOP CAP 100ML',
    sku: 'RAW-CAP-100',
    itemType: ItemType.RAW,
    category: 'Packaging',
    baseUnit: 'pcs',
    hsnCode: '392350',
    gstRate: 18,
  },
  {
    key: 'label-100',
    storeName: 'Self Adhesive Label 100ml',
    tallyName: 'SELF ADHESIVE LABEL 100ML',
    sku: 'RAW-LBL-100',
    itemType: ItemType.RAW,
    category: 'Packaging',
    baseUnit: 'pcs',
    hsnCode: '482110',
    gstRate: 18,
  },
  {
    key: 'carton-100',
    storeName: 'Corrugated Carton 100ml',
    tallyName: 'CORRUGATED CARTON 100ML',
    sku: 'RAW-CTN-100',
    itemType: ItemType.RAW,
    category: 'Packaging',
    baseUnit: 'pcs',
    hsnCode: '481910',
    gstRate: 18,
  },
  {
    key: 'sanitizer-100',
    storeName: 'Hand Sanitizer 100ml',
    tallyName: 'HAND SANITIZER 100ML',
    sku: 'FG-HS-100',
    itemType: ItemType.FINISHED,
    category: 'Finished Good',
    baseUnit: 'pcs',
    hsnCode: '380894',
    gstRate: 18,
  },
  {
    key: 'disinfectant-500',
    storeName: 'Surface Disinfectant 500ml',
    tallyName: 'SURFACE DISINFECTANT 500ML',
    sku: 'FG-SD-500',
    itemType: ItemType.FINISHED,
    category: 'Finished Good',
    baseUnit: 'pcs',
    hsnCode: '380894',
    gstRate: 18,
  },
  {
    key: 'cleanser-250',
    storeName: 'Herbal Cleanser 250ml',
    tallyName: 'HERBAL CLEANSER 250ML',
    sku: 'FG-HC-250',
    itemType: ItemType.FINISHED,
    category: 'Finished Good',
    baseUnit: 'pcs',
    hsnCode: '340220',
    gstRate: 18,
  },
];

const seedLedgerReceipts: SeedLedgerReceipt[] = [
  {
    referenceNo: 'SEED-PF-PUR-001',
    itemKey: 'purified-water',
    date: '2026-04-01',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'PW-2401-A',
    mfgDate: '2026-03-01',
    expiryDate: '2027-03-01',
    receiptQty: 600,
    rate: 18,
    remarks: 'Seed stock for multiple MRS and issue testing',
  },
  {
    referenceNo: 'SEED-PF-PUR-002',
    itemKey: 'purified-water',
    date: '2026-04-03',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'PW-2402-B',
    mfgDate: '2026-03-10',
    expiryDate: '2027-03-10',
    receiptQty: 500,
    rate: 19,
    remarks: 'Second batch to test issue selection',
  },
  {
    referenceNo: 'SEED-PF-IPA-001',
    itemKey: 'isopropyl-alcohol',
    date: '2026-04-01',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'IPA-2401-A',
    mfgDate: '2026-03-02',
    expiryDate: '2027-03-02',
    receiptQty: 320,
    rate: 135,
    remarks: 'Primary IPA stock',
  },
  {
    referenceNo: 'SEED-PF-IPA-002',
    itemKey: 'isopropyl-alcohol',
    date: '2026-04-04',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'IPA-2402-B',
    mfgDate: '2026-03-14',
    expiryDate: '2027-03-14',
    receiptQty: 280,
    rate: 138,
    remarks: 'Secondary IPA batch for repeated issue entries',
  },
  {
    referenceNo: 'SEED-PF-GLY-001',
    itemKey: 'glycerine',
    date: '2026-04-02',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'GLY-2401-A',
    mfgDate: '2026-03-04',
    expiryDate: '2027-03-04',
    receiptQty: 180,
    rate: 92,
    remarks: 'Glycerine stock',
  },
  {
    referenceNo: 'SEED-PF-CRB-001',
    itemKey: 'carbomer',
    date: '2026-04-02',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'CRB-2401-A',
    mfgDate: '2026-03-05',
    expiryDate: '2027-03-05',
    receiptQty: 90,
    rate: 420,
    remarks: 'Carbomer stock',
  },
  {
    referenceNo: 'SEED-PF-PFB-001',
    itemKey: 'perfume-base',
    date: '2026-04-03',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'PFB-2401-A',
    mfgDate: '2026-03-08',
    expiryDate: '2027-03-08',
    receiptQty: 75,
    rate: 250,
    remarks: 'Perfume base stock',
  },
  {
    referenceNo: 'SEED-PF-PET-001',
    itemKey: 'pet-bottle-100',
    date: '2026-04-05',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'PET100-2401-A',
    mfgDate: '2026-03-12',
    expiryDate: '2028-03-12',
    receiptQty: 1500,
    rate: 4.5,
    remarks: 'Bottle stock for repeated MRS requests',
  },
  {
    referenceNo: 'SEED-PF-CAP-001',
    itemKey: 'flip-top-cap-100',
    date: '2026-04-05',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'CAP100-2401-A',
    mfgDate: '2026-03-12',
    expiryDate: '2028-03-12',
    receiptQty: 1500,
    rate: 1.8,
    remarks: 'Cap stock',
  },
  {
    referenceNo: 'SEED-PF-LBL-001',
    itemKey: 'label-100',
    date: '2026-04-06',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'LBL100-2401-A',
    mfgDate: '2026-03-15',
    expiryDate: '2028-03-15',
    receiptQty: 1500,
    rate: 0.9,
    remarks: 'Label stock',
  },
  {
    referenceNo: 'SEED-PF-CTN-001',
    itemKey: 'carton-100',
    date: '2026-04-06',
    particulars: 'Production Flow Seed Receipt',
    batchNo: 'CTN100-2401-A',
    mfgDate: '2026-03-16',
    expiryDate: '2028-03-16',
    receiptQty: 300,
    rate: 8.25,
    remarks: 'Carton stock',
  },
];

const seedCustomers: SeedCustomer[] = [
  {
    name: 'HealthPlus Distributors',
    contactPerson: 'Riya Shah',
    phone: '9876543210',
    email: 'sales@healthplus.example',
    address1: 'Warehouse 8',
    address2: 'Pharma Logistics Park',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400093',
    gstNumber: '27AACCH1234A1Z5',
    panNumber: 'AACCH1234A',
    remarks: 'Active demo customer for PI and invoice flow',
  },
];

function toItemData(companyId: string, item: SeedItem): Prisma.ItemUncheckedCreateInput {
  return {
    companyId,
    storeName: item.storeName,
    storeNameNormalized: normalizeLookupValue(item.storeName),
    tallyName: item.tallyName,
    tallyNameNormalized: normalizeLookupValue(item.tallyName),
    sku: item.sku,
    skuNormalized: item.sku.toLowerCase(),
    itemType: item.itemType,
    category: item.category,
    baseUnit: item.baseUnit,
    hsnCode: item.hsnCode,
    gstRate: new Prisma.Decimal(item.gstRate.toFixed(2)),
    isActive: true,
  };
}

function toPartyData(companyId: string, customer: SeedCustomer): Prisma.PartyUncheckedCreateInput {
  return {
    companyId,
    name: customer.name,
    nameNormalized: normalizeLookupValue(customer.name),
    partyType: 'CUSTOMER',
    contactPerson: customer.contactPerson,
    phone: customer.phone,
    altPhone: customer.phone,
    email: customer.email.toLowerCase(),
    address1: customer.address1,
    address2: customer.address2,
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
    gstNumber: customer.gstNumber,
    gstNumberNormalized: customer.gstNumber.toLowerCase(),
    panNumber: customer.panNumber,
    panNumberNormalized: customer.panNumber.toLowerCase(),
    openingBalance: new Prisma.Decimal('0'),
    creditLimit: new Prisma.Decimal('0'),
    remarks: customer.remarks,
    isActive: true,
  };
}

async function ensureCompanyAdmin() {
  const company = await prisma.company.upsert({
    where: { code: demoCompany.code },
    update: {
      name: demoCompany.name,
      contactEmail: demoCompany.email,
      contactPhone: demoCompany.phone,
      address: demoCompany.address,
      status: 'ACTIVE',
    },
    create: {
      name: demoCompany.name,
      code: demoCompany.code,
      contactEmail: demoCompany.email,
      contactPhone: demoCompany.phone,
      address: demoCompany.address,
      status: 'ACTIVE',
    },
  });

  const passwordHash = await hashPassword(demoAdmin.password);
  const admin = await prisma.user.upsert({
    where: { email: demoAdmin.email },
    update: {
      fullName: demoAdmin.fullName,
      passwordHash,
      accountType: AccountType.COMPANY_ADMIN,
      companyId: company.id,
      isActive: true,
      mustResetPassword: false,
      departmentId: null,
      designationId: null,
      roleId: null,
    },
    create: {
      email: demoAdmin.email,
      fullName: demoAdmin.fullName,
      passwordHash,
      accountType: AccountType.COMPANY_ADMIN,
      companyId: company.id,
      isActive: true,
      mustResetPassword: false,
    },
  });

  if (company.adminUserId !== admin.id) {
    await prisma.company.update({
      where: { id: company.id },
      data: { adminUserId: admin.id },
    });
  }

  return { company, admin };
}

async function upsertItems(companyId: string) {
  const itemMap = new Map<string, { id: string; storeName: string }>();

  for (const item of seedItems) {
    const existing = await prisma.item.findFirst({
      where: {
        companyId,
        OR: [
          { skuNormalized: item.sku.toLowerCase() },
          { storeNameNormalized: normalizeLookupValue(item.storeName) },
        ],
      },
      select: { id: true },
    });

    const data = toItemData(companyId, item);
    const record = existing
      ? await prisma.item.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.item.create({ data });

    itemMap.set(item.key, { id: record.id, storeName: record.storeName });
  }

  return itemMap;
}

async function upsertCustomers(companyId: string) {
  let activeCount = 0;

  for (const customer of seedCustomers) {
    const existing = await prisma.party.findFirst({
      where: {
        companyId,
        nameNormalized: normalizeLookupValue(customer.name),
      },
      select: { id: true },
    });

    const data = toPartyData(companyId, customer);

    await (existing
      ? prisma.party.update({
          where: { id: existing.id },
          data,
        })
      : prisma.party.create({ data }));

    activeCount += 1;
  }

  return activeCount;
}

async function ensureSeedStock(companyId: string, itemMap: Map<string, { id: string; storeName: string }>) {
  let createdCount = 0;

  for (const receipt of seedLedgerReceipts) {
    const item = itemMap.get(receipt.itemKey);
    if (!item) {
      throw new Error(`Missing seeded item for key: ${receipt.itemKey}`);
    }

    const existing = await prisma.stockLedgerEntry.findFirst({
      where: {
        companyId,
        referenceNo: receipt.referenceNo,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await prisma.stockLedgerEntry.create({
      data: buildLedgerEntryData({
        companyId,
        itemId: item.id,
        date: receipt.date,
        referenceNo: receipt.referenceNo,
        type: 'PURCHASE',
        particulars: receipt.particulars,
        itemName: item.storeName,
        itemCategory: 'RAW',
        batchNo: receipt.batchNo,
        mfgDate: receipt.mfgDate,
        expiryDate: receipt.expiryDate,
        receiptQty: receipt.receiptQty,
        issueQty: 0,
        rate: receipt.rate,
        remarks: receipt.remarks,
      }),
    });

    createdCount += 1;
  }

  return createdCount;
}

async function main() {
  const { company } = await ensureCompanyAdmin();
  const itemMap = await upsertItems(company.id);
  const customerCount = await upsertCustomers(company.id);
  const createdLedgerRows = await ensureSeedStock(company.id, itemMap);

  const rawCount = seedItems.filter((item) => item.itemType === ItemType.RAW).length;
  const finishedCount = seedItems.filter((item) => item.itemType === ItemType.FINISHED).length;

  console.log('');
  console.log('Production flow seed is ready.');
  console.log(`Company: ${demoCompany.name} (${demoCompany.code})`);
  console.log(`Company admin login: ${demoAdmin.email} / ${demoAdmin.password}`);
  console.log(`Seeded raw items: ${rawCount}`);
  console.log(`Seeded finished items: ${finishedCount}`);
  console.log(`Seeded active customers: ${customerCount}`);
  console.log(`New stock ledger receipt rows created: ${createdLedgerRows}`);
  console.log('You can now create production batches, raise multiple MRS records, record stock issues, create PIs, and convert them into invoices.');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

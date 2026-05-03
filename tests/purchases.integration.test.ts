import { AccountType, ItemType, PartyType } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type CreateApp = typeof import('../src/app').createApp;
type PrismaInstance = typeof import('../src/lib/prisma').prisma;
type HashPassword = typeof import('../src/lib/password').hashPassword;
type CreateAccessToken = typeof import('../src/lib/tokens').createAccessToken;

type PurchaseLinePayload = {
  itemId: string;
  ulpQty: number;
  billQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  rate: number;
  taxableValue?: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  remarks?: string;
};

type PurchasePayload = {
  vendorId: string;
  challanNo: string;
  challanDate: string;
  billNo: string;
  billDate: string;
  gateEntryNo: string;
  entryDate: string;
  preparedBy?: string;
  sanctionedBy?: string;
  authorizedSignatory?: string;
  items: PurchaseLinePayload[];
};

describeIfDb('purchase GIN integration', () => {
  let createApp: CreateApp;
  let prisma: PrismaInstance;
  let hashPassword: HashPassword;
  let createAccessToken: CreateAccessToken;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

    const appModule = await import('../src/app');
    const prismaModule = await import('../src/lib/prisma');
    const passwordModule = await import('../src/lib/password');
    const tokensModule = await import('../src/lib/tokens');

    createApp = appModule.createApp;
    prisma = prismaModule.prisma;
    hashPassword = passwordModule.hashPassword;
    createAccessToken = tokensModule.createAccessToken;
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.stockLedgerEntry.deleteMany();
    await prisma.purchaseGinItem.deleteMany();
    await prisma.purchaseGin.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.designation.deleteMany();
    await prisma.department.deleteMany();
    await prisma.party.deleteMany();
    await prisma.item.deleteMany();
    await prisma.company.deleteMany();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createCompanyContext(options?: {
    suffix?: string;
    userPermissions?: string[];
    withCompanyUser?: boolean;
  }) {
    const suffix = options?.suffix ?? Math.random().toString(36).slice(2, 8);
    const passwordHash = await hashPassword('Password123!');

    const company = await prisma.company.create({
      data: {
        name: `InventoryX ${suffix}`,
        code: `INV-${suffix}`.toUpperCase(),
        contactEmail: `admin-${suffix}@inventoryx.test`,
        contactPhone: '9999999999',
        address: 'MIDC, Mumbai',
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin-${suffix}@inventoryx.test`,
        passwordHash,
        accountType: AccountType.COMPANY_ADMIN,
        companyId: company.id,
        fullName: `Admin ${suffix}`,
        isActive: true,
        mustResetPassword: false,
      },
    });

    await prisma.company.update({
      where: { id: company.id },
      data: { adminUserId: admin.id },
    });

    let user: Awaited<ReturnType<typeof prisma.user.create>> | null = null;

    if (options?.withCompanyUser || options?.userPermissions) {
      const role = await prisma.role.create({
        data: {
          companyId: company.id,
          name: `Operator ${suffix}`,
          description: 'Purchase test role',
          isActive: true,
        },
      });

      if (options?.userPermissions?.length) {
        await prisma.rolePermission.createMany({
          data: options.userPermissions.map((permission) => {
            const [module, action] = permission.split('.');
            return {
              companyId: company.id,
              roleId: role.id,
              module,
              action,
            };
          }),
        });
      }

      user = await prisma.user.create({
        data: {
          email: `user-${suffix}@inventoryx.test`,
          passwordHash,
          accountType: AccountType.COMPANY_USER,
          companyId: company.id,
          fullName: `User ${suffix}`,
          roleId: role.id,
          isActive: true,
          mustResetPassword: false,
        },
      });
    }

    return {
      company,
      admin,
      user,
      adminToken: createAccessToken({
        sub: admin.id,
        accountType: admin.accountType,
        companyId: company.id,
      }),
      userToken: user
        ? createAccessToken({
            sub: user.id,
            accountType: user.accountType,
            companyId: company.id,
          })
        : null,
    };
  }

  async function createSuperAdminToken() {
    const user = await prisma.user.create({
      data: {
        email: 'super-admin@inventoryx.test',
        passwordHash: await hashPassword('Password123!'),
        accountType: AccountType.SUPER_ADMIN,
        fullName: 'Super Admin',
        isActive: true,
        mustResetPassword: false,
      },
    });

    return createAccessToken({
      sub: user.id,
      accountType: user.accountType,
      companyId: null,
    });
  }

  async function createParty(companyId: string, input: {
    name: string;
    partyType?: PartyType;
    isActive?: boolean;
    gstNumber?: string | null;
    panNumber?: string | null;
  }) {
    return prisma.party.create({
      data: {
        companyId,
        name: input.name,
        nameNormalized: input.name.trim().toLowerCase(),
        partyType: input.partyType ?? PartyType.VENDOR,
        contactPerson: 'Rajesh Kumar',
        phone: '9876543210',
        altPhone: null,
        email: 'vendor@inventoryx.test',
        address1: 'Plot 45',
        address2: null,
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400093',
        gstNumber: input.gstNumber ?? '27AABCU9603R1ZM',
        gstNumberNormalized: input.gstNumber ?? '27AABCU9603R1ZM',
        panNumber: input.panNumber ?? 'AABCU9603R',
        panNumberNormalized: input.panNumber ?? 'AABCU9603R',
        openingBalance: 0,
        creditLimit: 0,
        remarks: null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async function createItem(companyId: string, input: {
    storeName: string;
    tallyName: string;
    sku: string;
    itemType?: ItemType;
    isActive?: boolean;
  }) {
    return prisma.item.create({
      data: {
        companyId,
        storeName: input.storeName,
        storeNameNormalized: input.storeName.trim().toLowerCase(),
        tallyName: input.tallyName,
        tallyNameNormalized: input.tallyName.trim().toLowerCase(),
        sku: input.sku,
        skuNormalized: input.sku.toLowerCase(),
        itemType: input.itemType ?? ItemType.RAW,
        baseUnit: 'kg',
        hsnCode: '7214',
        gstRate: 18,
        isActive: input.isActive ?? true,
      },
    });
  }

  function withComputedTaxFields(item: PurchaseLinePayload) {
    return {
      ...item,
      taxableValue: item.taxableValue ?? Number((item.acceptedQty * item.rate).toFixed(2)),
      cgstRate: item.cgstRate ?? 0,
      sgstRate: item.sgstRate ?? 0,
      igstRate: item.igstRate ?? 0,
    };
  }

  function buildPurchasePayload(vendorId: string, itemId: string, overrides?: Partial<PurchasePayload>): PurchasePayload {
    const baseItems = [
      withComputedTaxFields({
        itemId,
        ulpQty: 10,
        billQty: 10,
        receivedQty: 10,
        acceptedQty: 8,
        rejectedQty: 2,
        batchNo: 'B-001',
        mfgDate: '2026-03-01',
        expiryDate: '2027-03-01',
        rate: 50,
        remarks: 'Minor damage',
      }),
    ];
    const merged = {
      vendorId,
      challanNo: 'CH-001',
      challanDate: '2026-04-01',
      billNo: 'BILL-001',
      billDate: '2026-04-01',
      gateEntryNo: 'GE-001',
      entryDate: '2026-04-01',
      preparedBy: 'Stores',
      sanctionedBy: 'QA Lead',
      authorizedSignatory: 'Plant Head',
      ...overrides,
    };

    return {
      ...merged,
      items: (merged.items ?? baseItems).map(withComputedTaxFields),
    };
  }

  it('requires authentication, rejects super admins, and enforces purchase permissions', async () => {
    const app = createApp();
    const superAdminToken = await createSuperAdminToken();
    const company = await createCompanyContext({
      suffix: 'purchase-perms',
      withCompanyUser: true,
      userPermissions: ['purchases.view'],
    });
    const vendor = await createParty(company.company.id, {
      name: 'Permission Vendor',
      gstNumber: '29AABCU9603R1ZM',
      panNumber: 'AABCU9603S',
    });
    const item = await createItem(company.company.id, {
      storeName: 'Permission Raw Item',
      tallyName: 'PERMISSION-RAW',
      sku: 'PR-001',
    });

    const created = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send(buildPurchasePayload(vendor.id, item.id));

    expect(created.status).toBe(201);

    const unauthenticated = await request(app).get('/purchases');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.message).toBe('Missing bearer token');

    const superAdminAccess = await request(app)
      .get('/purchases')
      .set(authHeader(superAdminToken));

    expect(superAdminAccess.status).toBe(403);
    expect(superAdminAccess.body.message).toBe('Company access required');

    const allowedList = await request(app)
      .get('/purchases')
      .set(authHeader(company.userToken!));

    expect(allowedList.status).toBe(200);
    expect(allowedList.body.data).toHaveLength(1);

    const blockedCreate = await request(app)
      .post('/purchases')
      .set(authHeader(company.userToken!))
      .send(buildPurchasePayload(vendor.id, item.id, { billNo: 'BILL-002' }));

    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.message).toContain('purchases.create');
  });

  it('creates GIN records, increments gin numbers, and writes ledger rows for accepted quantity only', async () => {
    const app = createApp();
    const company = await createCompanyContext({ suffix: 'purchase-create' });
    const vendor = await createParty(company.company.id, {
      name: 'ABC Steel Suppliers',
    });
    const itemA = await createItem(company.company.id, {
      storeName: 'Steel Rod 10mm',
      tallyName: 'STEEL-ROD-10',
      sku: 'SR-10MM',
    });
    const itemB = await createItem(company.company.id, {
      storeName: 'Copper Wire 2mm',
      tallyName: 'COPPER-WIRE-2',
      sku: 'CW-2MM',
    });

    const created = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send({
        ...buildPurchasePayload(vendor.id, itemA.id),
        items: [
          {
            itemId: itemA.id,
            ulpQty: 10,
            billQty: 10,
            receivedQty: 10,
            acceptedQty: 8,
            rejectedQty: 2,
            batchNo: 'RM-001',
            mfgDate: '2026-03-01',
            expiryDate: '2027-03-01',
            rate: 50,
            remarks: 'Accepted with minor bends',
          },
          {
            itemId: itemB.id,
            ulpQty: 3,
            billQty: 3,
            receivedQty: 3,
            acceptedQty: 0,
            rejectedQty: 3,
            batchNo: 'RM-002',
            mfgDate: '2026-03-05',
            expiryDate: '2027-03-05',
            rate: 20,
            remarks: 'Rejected line',
          },
        ],
      });

    expect(created.status).toBe(201);
    expect(created.body.data.ginNo).toBe('GIN-00001');
    expect(created.body.data.totalAmount).toBe(400);
    expect(created.body.data.totalAcceptedQty).toBe(8);
    expect(created.body.data.totalRejectedQty).toBe(5);
    expect(created.body.data.items).toHaveLength(2);

    const second = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send(buildPurchasePayload(vendor.id, itemA.id, {
        challanNo: 'CH-002',
        billNo: 'BILL-002',
        gateEntryNo: 'GE-002',
        items: [
          {
            itemId: itemA.id,
            ulpQty: 5,
            billQty: 5,
            receivedQty: 5,
            acceptedQty: 5,
            rejectedQty: 0,
            batchNo: 'RM-003',
            mfgDate: '2026-03-10',
            expiryDate: '2027-03-10',
            rate: 60,
            remarks: '',
          },
        ],
      }));

    expect(second.status).toBe(201);
    expect(second.body.data.ginNo).toBe('GIN-00002');

    const detail = await request(app)
      .get(`/purchases/${created.body.data.id}`)
      .set(authHeader(company.adminToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.vendorName).toBe('ABC Steel Suppliers');
    expect(detail.body.data.items[0].itemName).toBe('Steel Rod 10mm');

    const ledger = await request(app)
      .get('/ledger')
      .query({ paginate: 'false' })
      .set(authHeader(company.adminToken));

    expect(ledger.status).toBe(200);
    expect(ledger.body.total).toBe(2);
    expect(ledger.body.data[0].referenceNo).toBe('GIN-00001');
    expect(ledger.body.data[0].type).toBe('purchase');
    expect(ledger.body.data[0].particulars).toBe('ABC Steel Suppliers');
    expect(ledger.body.data[0].receiptQty).toBe(8);
    expect(ledger.body.data[0].issueQty).toBe(0);
    expect(ledger.body.data[0].sourceModule).toBe('purchases');
    expect(ledger.body.data[0].sourcePath).toBe(`/purchases/${created.body.data.id}`);
  });

  it('rejects invalid vendors or non-raw/non-active items', async () => {
    const app = createApp();
    const company = await createCompanyContext({ suffix: 'purchase-invalid-refs' });
    const customerOnly = await createParty(company.company.id, {
      name: 'Customer Only',
      partyType: PartyType.CUSTOMER,
      gstNumber: '24AABCU9603R1ZM',
      panNumber: 'AABCU9603T',
    });
    const vendor = await createParty(company.company.id, {
      name: 'Valid Vendor',
      gstNumber: '07AABCU9603R1ZM',
      panNumber: 'AABCU9603U',
    });
    const finishedItem = await createItem(company.company.id, {
      storeName: 'Finished Good X',
      tallyName: 'FINISHED-X',
      sku: 'FG-001',
      itemType: ItemType.FINISHED,
    });
    const inactiveRaw = await createItem(company.company.id, {
      storeName: 'Inactive Raw',
      tallyName: 'INACTIVE-RAW',
      sku: 'IR-001',
      itemType: ItemType.RAW,
      isActive: false,
    });

    const badVendor = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send(buildPurchasePayload(customerOnly.id, finishedItem.id));

    expect(badVendor.status).toBe(400);
    expect(badVendor.body.message).toContain('vendor');

    const badItem = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send(buildPurchasePayload(vendor.id, finishedItem.id));

    expect(badItem.status).toBe(400);
    expect(badItem.body.message).toContain('active raw item');

    const inactiveItem = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send(buildPurchasePayload(vendor.id, inactiveRaw.id));

    expect(inactiveItem.status).toBe(400);
    expect(inactiveItem.body.message).toContain('active raw item');
  });

  it('validates quantities and dates on purchase lines', async () => {
    const app = createApp();
    const company = await createCompanyContext({ suffix: 'purchase-validation' });
    const vendor = await createParty(company.company.id, {
      name: 'Validation Vendor',
      gstNumber: '06AABCU9603R1ZM',
      panNumber: 'AABCU9603V',
    });
    const item = await createItem(company.company.id, {
      storeName: 'Validation Raw',
      tallyName: 'VALIDATION-RAW',
      sku: 'VR-001',
    });

    const mismatchedQty = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send({
        ...buildPurchasePayload(vendor.id, item.id),
        items: [
          {
            itemId: item.id,
            ulpQty: 5,
            billQty: 5,
            receivedQty: 5,
            acceptedQty: 4,
            rejectedQty: 0,
            batchNo: 'VAL-001',
            mfgDate: '2026-03-01',
            expiryDate: '2027-03-01',
            rate: 50,
            remarks: '',
          },
        ],
      });

    expect(mismatchedQty.status).toBe(400);
    expect(mismatchedQty.body.message).toBe('Validation failed');
    expect(JSON.stringify(mismatchedQty.body.errors.fieldErrors)).toContain('Accepted + Rejected must equal Received');

    const invalidDates = await request(app)
      .post('/purchases')
      .set(authHeader(company.adminToken))
      .send({
        ...buildPurchasePayload(vendor.id, item.id),
        items: [
          {
            itemId: item.id,
            ulpQty: 5,
            billQty: 5,
            receivedQty: 5,
            acceptedQty: 5,
            rejectedQty: 0,
            batchNo: 'VAL-002',
            mfgDate: '2026-04-01',
            expiryDate: '2026-03-01',
            rate: 50,
            remarks: '',
          },
        ],
      });

    expect(invalidDates.status).toBe(400);
    expect(invalidDates.body.message).toBe('Validation failed');
    expect(JSON.stringify(invalidDates.body.errors.fieldErrors)).toContain('Expiry date cannot be before MFG date');
  });

  it('supports list filtering, pagination, summary, detail fetch, and company isolation', async () => {
    const app = createApp();
    const alpha = await createCompanyContext({ suffix: 'purchase-alpha' });
    const beta = await createCompanyContext({ suffix: 'purchase-beta' });
    const vendorA = await createParty(alpha.company.id, {
      name: 'Alpha Vendor',
      gstNumber: '33AABCU9603R1ZM',
      panNumber: 'AABCU9603W',
    });
    const vendorB = await createParty(alpha.company.id, {
      name: 'Beta Vendor',
      gstNumber: '19AABCU9603R1ZM',
      panNumber: 'AABCU9603X',
    });
    const betaVendor = await createParty(beta.company.id, {
      name: 'Outside Vendor',
      gstNumber: '08AABCU9603R1ZM',
      panNumber: 'AABCU9603Y',
    });
    const alphaItem = await createItem(alpha.company.id, {
      storeName: 'Alpha Raw',
      tallyName: 'ALPHA-RAW',
      sku: 'AR-001',
    });
    const betaItem = await createItem(beta.company.id, {
      storeName: 'Beta Raw',
      tallyName: 'BETA-RAW',
      sku: 'BR-001',
    });

    const alphaOne = await request(app)
      .post('/purchases')
      .set(authHeader(alpha.adminToken))
      .send(buildPurchasePayload(vendorA.id, alphaItem.id, {
        billNo: 'ALPHA-BILL-001',
        challanNo: 'ALPHA-CH-001',
        gateEntryNo: 'ALPHA-GE-001',
        entryDate: '2026-04-02',
        challanDate: '2026-04-02',
        billDate: '2026-04-02',
      }));

    const alphaTwo = await request(app)
      .post('/purchases')
      .set(authHeader(alpha.adminToken))
      .send(buildPurchasePayload(vendorB.id, alphaItem.id, {
        billNo: 'ALPHA-BILL-002',
        challanNo: 'ALPHA-CH-002',
        gateEntryNo: 'ALPHA-GE-002',
        entryDate: '2026-04-10',
        challanDate: '2026-04-10',
        billDate: '2026-04-10',
        items: [
          {
            itemId: alphaItem.id,
            ulpQty: 4,
            billQty: 4,
            receivedQty: 4,
            acceptedQty: 4,
            rejectedQty: 0,
            batchNo: 'ALPHA-002',
            mfgDate: '2026-03-15',
            expiryDate: '2027-03-15',
            rate: 75,
            remarks: '',
          },
        ],
      }));

    await request(app)
      .post('/purchases')
      .set(authHeader(beta.adminToken))
      .send(buildPurchasePayload(betaVendor.id, betaItem.id, {
        billNo: 'BETA-BILL-001',
      }));

    expect(alphaOne.status).toBe(201);
    expect(alphaTwo.status).toBe(201);

    const filtered = await request(app)
      .get('/purchases')
      .query({
        search: 'ALPHA-BILL',
        vendorId: vendorB.id,
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
        page: '1',
        limit: '1',
        sortBy: 'entryDate',
        sortOrder: 'desc',
      })
      .set(authHeader(alpha.adminToken));

    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].billNo).toBe('ALPHA-BILL-002');
    expect(filtered.body.meta.pagination.total).toBe(1);
    expect(filtered.body.meta.summary).toEqual({
      count: 1,
      totalAmount: 300,
      totalAcceptedQty: 4,
      totalRejectedQty: 0,
      vendorCount: 1,
    });

    const unpaginated = await request(app)
      .get('/purchases')
      .query({ paginate: 'false', search: 'ALPHA-BILL' })
      .set(authHeader(alpha.adminToken));

    expect(unpaginated.status).toBe(200);
    expect(unpaginated.body.data).toHaveLength(2);
    expect(unpaginated.body.meta.summary).toEqual({
      count: 2,
      totalAmount: 700,
      totalAcceptedQty: 12,
      totalRejectedQty: 2,
      vendorCount: 2,
    });

    const detail = await request(app)
      .get(`/purchases/${alphaTwo.body.data.id}`)
      .set(authHeader(alpha.adminToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.ginNo).toBe(alphaTwo.body.data.ginNo);
    expect(detail.body.data.items[0].batchNo).toBe('ALPHA-002');
  });
});

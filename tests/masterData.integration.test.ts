import { AccountType } from '@prisma/client';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type CreateApp = typeof import('../src/app').createApp;
type PrismaInstance = typeof import('../src/lib/prisma').prisma;
type HashPassword = typeof import('../src/lib/password').hashPassword;
type CreateAccessToken = typeof import('../src/lib/tokens').createAccessToken;

type PartyPayload = {
  name: string;
  partyType: 'vendor' | 'customer' | 'both';
  contactPerson: string;
  phone: string;
  altPhone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  openingBalance: number;
  creditLimit: number;
  remarks: string;
  isActive: boolean;
};

type ItemPayload = {
  storeName: string;
  tallyName: string;
  sku: string;
  itemType: 'raw' | 'finished';
  category: string;
  baseUnit: 'kg' | 'pcs' | 'nos' | 'ltr' | 'mtr' | 'set' | 'ton' | 'box' | 'bundle' | 'roll' | 'bag';
  hsnCode: string;
  gstRate: number;
  isActive: boolean;
};

const basePartyPayload: PartyPayload = {
  name: 'ABC Steel Suppliers',
  partyType: 'vendor' as const,
  contactPerson: 'Rajesh Kumar',
  phone: '9876543210',
  altPhone: '9876543211',
  email: 'contact@abcsteel.com',
  address1: 'Plot 45, MIDC',
  address2: 'Andheri East',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400093',
  gstNumber: '27AABCU9603R1ZM',
  panNumber: 'AABCU9603R',
  openingBalance: 50000,
  creditLimit: 200000,
  remarks: 'Primary steel vendor',
  isActive: true,
};

const baseItemPayload: ItemPayload = {
  storeName: 'Steel Rod 10mm',
  tallyName: 'STEEL-ROD-10',
  sku: 'SR-10MM',
  itemType: 'raw' as const,
  category: 'Metal',
  baseUnit: 'kg' as const,
  hsnCode: '7214',
  gstRate: 18,
  isActive: true,
};

describeIfDb('party and item master integration', () => {
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
          description: 'Master data test role',
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

  async function createParty(
    app: ReturnType<CreateApp>,
    token: string,
    overrides: Partial<PartyPayload> = {},
  ) {
    const response = await request(app)
      .post('/parties')
      .set(authHeader(token))
      .send({ ...basePartyPayload, ...overrides });

    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function createItem(
    app: ReturnType<CreateApp>,
    token: string,
    overrides: Partial<ItemPayload> = {},
  ) {
    const response = await request(app)
      .post('/items')
      .set(authHeader(token))
      .send({ ...baseItemPayload, ...overrides });

    expect(response.status).toBe(201);
    return response.body.data;
  }

  it('requires authentication and rejects super admins on company master routes', async () => {
    const app = createApp();
    const superAdminToken = await createSuperAdminToken();

    const unauthenticated = await request(app).get('/parties');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.message).toBe('Missing bearer token');

    const superAdminAccess = await request(app)
      .get('/items')
      .set(authHeader(superAdminToken));

    expect(superAdminAccess.status).toBe(403);
    expect(superAdminAccess.body.message).toBe('Company access required');
  });

  it('enforces party permissions for company users', async () => {
    const app = createApp();
    const company = await createCompanyContext({
      suffix: 'party-perms',
      withCompanyUser: true,
      userPermissions: ['parties.view'],
    });

    await createParty(app, company.adminToken, { name: 'Permission Vendor' });

    const allowedList = await request(app)
      .get('/parties')
      .set(authHeader(company.userToken!));

    expect(allowedList.status).toBe(200);
    expect(allowedList.body.data).toHaveLength(1);

    const blockedCreate = await request(app)
      .post('/parties')
      .set(authHeader(company.userToken!))
      .send({ ...basePartyPayload, name: 'Blocked Vendor', gstNumber: '29AABCU9603R1ZM' });

    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.message).toContain('parties.create');
  });

  it('supports party listing, filtering, pagination, dropdown mode, and company isolation', async () => {
    const app = createApp();
    const alpha = await createCompanyContext({ suffix: 'party-a' });
    const beta = await createCompanyContext({ suffix: 'party-b' });

    await createParty(app, alpha.adminToken, {
      name: 'Beta Vendor',
      partyType: 'vendor',
      gstNumber: '29AABCU9603R1ZM',
      panNumber: 'AABCU9603S',
      city: 'Pune',
    });
    await createParty(app, alpha.adminToken, {
      name: 'Alpha Vendor',
      partyType: 'vendor',
      gstNumber: '24AABCU9603R1ZM',
      panNumber: 'AABCU9603T',
      city: 'Mumbai',
    });
    await createParty(app, alpha.adminToken, {
      name: 'Gamma Customer',
      partyType: 'customer',
      gstNumber: '07AABCU9603R1ZM',
      panNumber: 'AABCU9603U',
      isActive: false,
      city: 'Delhi',
    });
    await createParty(app, beta.adminToken, {
      name: 'Outside Vendor',
      partyType: 'vendor',
      gstNumber: '06AABCU9603R1ZM',
      panNumber: 'AABCU9603V',
    });

    const paginated = await request(app)
      .get('/parties')
      .query({ status: 'active', partyType: 'vendor', page: '1', limit: '1', sortBy: 'name', sortOrder: 'asc' })
      .set(authHeader(alpha.adminToken));

    expect(paginated.status).toBe(200);
    expect(paginated.body.data).toHaveLength(1);
    expect(paginated.body.data[0].name).toBe('Alpha Vendor');
    expect(paginated.body.meta.pagination.total).toBe(2);
    expect(paginated.body.meta.pagination.totalPages).toBe(2);
    expect(paginated.body.meta.summary).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      vendors: 2,
      customers: 1,
      both: 0,
    });

    const dropdown = await request(app)
      .get('/parties')
      .query({ paginate: 'false', partyType: 'customer' })
      .set(authHeader(alpha.adminToken));

    expect(dropdown.status).toBe(200);
    expect(dropdown.body.data).toHaveLength(1);
    expect(dropdown.body.data[0].name).toBe('Gamma Customer');
    expect(dropdown.body.meta.pagination.paginate).toBe(false);
    expect(dropdown.body.meta.pagination.total).toBe(1);
  });

  it('creates, updates, fetches, toggles, validates, and enforces uniqueness for parties', async () => {
    const app = createApp();
    const company = await createCompanyContext({ suffix: 'party-crud' });

    const created = await request(app)
      .post('/parties')
      .set(authHeader(company.adminToken))
      .send(basePartyPayload);

    expect(created.status).toBe(201);
    expect(created.body.data.updatedAt).toBeTruthy();
    expect(created.body.data.openingBalance).toBe(50000);

    const detail = await request(app)
      .get(`/parties/${created.body.data.id}`)
      .set(authHeader(company.adminToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.name).toBe(basePartyPayload.name);

    const updated = await request(app)
      .put(`/parties/${created.body.data.id}`)
      .set(authHeader(company.adminToken))
      .send({
        ...basePartyPayload,
        name: 'ABC Steel and Alloys',
        partyType: 'both',
        email: 'Sales@ABCSteel.com',
        openingBalance: 75000.25,
        creditLimit: 250000,
        remarks: 'Updated party',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('ABC Steel and Alloys');
    expect(updated.body.data.partyType).toBe('both');
    expect(updated.body.data.email).toBe('sales@abcsteel.com');
    expect(updated.body.data.openingBalance).toBe(75000.25);

    const explicitStatus = await request(app)
      .patch(`/parties/${created.body.data.id}/status`)
      .set(authHeader(company.adminToken))
      .send({ isActive: false });

    expect(explicitStatus.status).toBe(200);
    expect(explicitStatus.body.data.isActive).toBe(false);

    const toggledStatus = await request(app)
      .patch(`/parties/${created.body.data.id}/status`)
      .set(authHeader(company.adminToken))
      .send({});

    expect(toggledStatus.status).toBe(200);
    expect(toggledStatus.body.data.isActive).toBe(true);

    const invalid = await request(app)
      .post('/parties')
      .set(authHeader(company.adminToken))
      .send({ ...basePartyPayload, name: 'Invalid Party', gstNumber: 'BAD-GST' });

    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('Validation failed');
    expect(invalid.body.errors.fieldErrors.gstNumber[0]).toContain('Invalid GST format');

    const duplicate = await request(app)
      .post('/parties')
      .set(authHeader(company.adminToken))
      .send({
        ...basePartyPayload,
        name: '  abc steel and alloys  ',
        gstNumber: '33AABCU9603R1ZM',
        panNumber: 'AABCU9603W',
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('Party name already exists');
  });

  it('enforces item permissions for company users', async () => {
    const app = createApp();
    const company = await createCompanyContext({
      suffix: 'item-perms',
      withCompanyUser: true,
      userPermissions: ['items.view'],
    });

    await createItem(app, company.adminToken, { storeName: 'Permission Item', tallyName: 'PERMISSION-ITEM' });

    const allowedList = await request(app)
      .get('/items')
      .set(authHeader(company.userToken!));

    expect(allowedList.status).toBe(200);
    expect(allowedList.body.data).toHaveLength(1);

    const blockedCreate = await request(app)
      .post('/items')
      .set(authHeader(company.userToken!))
      .send({ ...baseItemPayload, storeName: 'Blocked Item', tallyName: 'BLOCKED-ITEM', sku: 'BLOCK-01' });

    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.message).toContain('items.create');
  });

  it('supports item listing, filtering, pagination, dropdown mode, and company isolation', async () => {
    const app = createApp();
    const alpha = await createCompanyContext({ suffix: 'item-a' });
    const beta = await createCompanyContext({ suffix: 'item-b' });

    await createItem(app, alpha.adminToken, {
      storeName: 'Copper Wire 2mm',
      tallyName: 'COPPER-WIRE-2',
      sku: 'CW-2MM',
      itemType: 'raw',
      category: 'Metal',
      baseUnit: 'kg',
      hsnCode: '7408',
    });
    await createItem(app, alpha.adminToken, {
      storeName: 'Steel Rod 10mm',
      tallyName: 'STEEL-ROD-10',
      sku: 'SR-10MM',
      itemType: 'raw',
      category: 'Metal',
      baseUnit: 'kg',
      hsnCode: '7214',
    });
    await createItem(app, alpha.adminToken, {
      storeName: 'Motor Assembly A1',
      tallyName: 'MOTOR-A1',
      sku: 'MA-A1',
      itemType: 'finished',
      category: 'Assembly',
      baseUnit: 'pcs',
      hsnCode: '8501',
      isActive: false,
    });
    await createItem(app, beta.adminToken, {
      storeName: 'Outside Item',
      tallyName: 'OUTSIDE-ITEM',
      sku: 'OUT-01',
    });

    const paginated = await request(app)
      .get('/items')
      .query({
        status: 'active',
        itemType: 'raw',
        category: 'Metal',
        baseUnit: 'kg',
        page: '1',
        limit: '1',
        sortBy: 'storeName',
        sortOrder: 'asc',
      })
      .set(authHeader(alpha.adminToken));

    expect(paginated.status).toBe(200);
    expect(paginated.body.data).toHaveLength(1);
    expect(paginated.body.data[0].storeName).toBe('Copper Wire 2mm');
    expect(paginated.body.meta.pagination.total).toBe(2);
    expect(paginated.body.meta.summary).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      raw: 2,
      finished: 1,
    });

    const dropdown = await request(app)
      .get('/items')
      .query({ paginate: 'false', itemType: 'finished' })
      .set(authHeader(alpha.adminToken));

    expect(dropdown.status).toBe(200);
    expect(dropdown.body.data).toHaveLength(1);
    expect(dropdown.body.data[0].storeName).toBe('Motor Assembly A1');
    expect(dropdown.body.meta.pagination.paginate).toBe(false);
  });

  it('creates, updates, fetches, toggles, validates, and enforces uniqueness for items', async () => {
    const app = createApp();
    const company = await createCompanyContext({ suffix: 'item-crud' });

    const created = await request(app)
      .post('/items')
      .set(authHeader(company.adminToken))
      .send(baseItemPayload);

    expect(created.status).toBe(201);
    expect(created.body.data.updatedAt).toBeTruthy();
    expect(created.body.data.gstRate).toBe(18);

    const detail = await request(app)
      .get(`/items/${created.body.data.id}`)
      .set(authHeader(company.adminToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.storeName).toBe(baseItemPayload.storeName);

    const updated = await request(app)
      .put(`/items/${created.body.data.id}`)
      .set(authHeader(company.adminToken))
      .send({
        ...baseItemPayload,
        storeName: 'Steel Rod 12mm',
        tallyName: 'STEEL-ROD-12',
        sku: 'sr-12mm',
        itemType: 'finished',
        category: 'Assembly',
        baseUnit: 'pcs',
        hsnCode: '7215',
        gstRate: 12,
        isActive: true,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.storeName).toBe('Steel Rod 12mm');
    expect(updated.body.data.itemType).toBe('finished');
    expect(updated.body.data.sku).toBe('SR-12MM');
    expect(updated.body.data.gstRate).toBe(12);

    const explicitStatus = await request(app)
      .patch(`/items/${created.body.data.id}/status`)
      .set(authHeader(company.adminToken))
      .send({ isActive: false });

    expect(explicitStatus.status).toBe(200);
    expect(explicitStatus.body.data.isActive).toBe(false);

    const toggledStatus = await request(app)
      .patch(`/items/${created.body.data.id}/status`)
      .set(authHeader(company.adminToken))
      .send({});

    expect(toggledStatus.status).toBe(200);
    expect(toggledStatus.body.data.isActive).toBe(true);

    const invalid = await request(app)
      .post('/items')
      .set(authHeader(company.adminToken))
      .send({ ...baseItemPayload, storeName: 'Bad Item', tallyName: 'BAD-ITEM', baseUnit: 'litre', gstRate: 120 });

    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('Validation failed');
    expect(invalid.body.errors.fieldErrors.baseUnit[0]).toContain('Invalid enum value');

    const duplicate = await request(app)
      .post('/items')
      .set(authHeader(company.adminToken))
      .send({
        ...baseItemPayload,
        storeName: '  steel rod 12mm  ',
        tallyName: 'STEEL-ROD-12-DUP',
        sku: 'UNIQUE-02',
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('Store name already exists');
  });
});

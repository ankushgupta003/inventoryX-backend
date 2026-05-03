import { AccountType, ItemType, StockLedgerEntryType } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildLedgerEntryData } from '../src/modules/production/production.utils';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type CreateApp = typeof import('../src/app').createApp;
type PrismaInstance = typeof import('../src/lib/prisma').prisma;
type HashPassword = typeof import('../src/lib/password').hashPassword;
type CreateAccessToken = typeof import('../src/lib/tokens').createAccessToken;

describeIfDb('sales PI and invoice integration', () => {
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
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.proformaInvoiceItem.deleteMany();
    await prisma.proformaInvoice.deleteMany();
    await prisma.stockMovementItem.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.materialRequisitionItem.deleteMany();
    await prisma.materialRequisition.deleteMany();
    await prisma.productionBmr.deleteMany();
    await prisma.productionBatch.deleteMany();
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

  async function createCompanyContext(suffix = Math.random().toString(36).slice(2, 8)) {
    const passwordHash = await hashPassword('Password123!');
    const company = await prisma.company.create({
      data: {
        name: `InventoryX ${suffix}`,
        code: `INVX-${suffix}`.toUpperCase(),
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

    return {
      company,
      admin,
      adminToken: createAccessToken({
        sub: admin.id,
        accountType: admin.accountType,
        companyId: company.id,
      }),
    };
  }

  async function createCustomer(companyId: string, overrides?: Partial<{ name: string; isActive: boolean }>) {
    const name = overrides?.name ?? `Customer ${Math.random().toString(36).slice(2, 6)}`;
    return prisma.party.create({
      data: {
        companyId,
        name,
        nameNormalized: name.toLowerCase(),
        partyType: 'CUSTOMER',
        contactPerson: 'Sales Contact',
        phone: '9876543210',
        altPhone: '9876543211',
        email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.test`,
        address1: 'Plot 12',
        address2: 'Industrial Area',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        gstNumber: `27AAC${Math.random().toString(36).slice(2, 8).toUpperCase()}1Z5`,
        gstNumberNormalized: `27aac${Math.random().toString(36).slice(2, 8)}1z5`,
        panNumber: `AAC${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        panNumberNormalized: `aac${Math.random().toString(36).slice(2, 7)}`,
        openingBalance: 0,
        creditLimit: 0,
        remarks: 'Sales customer',
        isActive: overrides?.isActive ?? true,
      },
    });
  }

  async function createFinishedItem(companyId: string, overrides?: Partial<{ storeName: string; gstRate: number; isActive: boolean }>) {
    const storeName = overrides?.storeName ?? `Finished Product ${Math.random().toString(36).slice(2, 6)}`;
    const sku = `FG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    return prisma.item.create({
      data: {
        companyId,
        storeName,
        storeNameNormalized: storeName.toLowerCase(),
        tallyName: storeName.toUpperCase(),
        tallyNameNormalized: storeName.toLowerCase(),
        sku,
        skuNormalized: sku.toLowerCase(),
        itemType: ItemType.FINISHED,
        baseUnit: 'pcs',
        hsnCode: '380894',
        gstRate: overrides?.gstRate ?? 18,
        isActive: overrides?.isActive ?? true,
      },
    });
  }

  async function seedFinishedStock(input: {
    companyId: string;
    itemId: string;
    itemName: string;
    batchNo: string;
    receiptQty: number;
    rate?: number;
  }) {
    await prisma.stockLedgerEntry.create({
      data: buildLedgerEntryData({
        companyId: input.companyId,
        itemId: input.itemId,
        date: '2026-04-01',
        referenceNo: `PRD-${input.batchNo}`,
        type: 'PRODUCTION',
        particulars: 'Seed FG Stock',
        itemName: input.itemName,
        itemCategory: 'FINISHED',
        batchNo: input.batchNo,
        mfgDate: '2026-04-01',
        expiryDate: '2028-04-01',
        receiptQty: input.receiptQty,
        issueQty: 0,
        rate: input.rate ?? 250,
        remarks: 'Seed finished stock',
      }),
    });
  }

  async function createPi(
    app: ReturnType<CreateApp>,
    token: string,
    payload: {
      customerId: string;
      itemId: string;
      quantity: number;
      rate: number;
      remarks?: string;
    },
  ) {
    return request(app)
      .post('/proforma-invoices')
      .set(authHeader(token))
      .send({
        date: '2026-04-10',
        customerId: payload.customerId,
        items: [
          {
            itemId: payload.itemId,
            quantity: payload.quantity,
            rate: payload.rate,
            remarks: payload.remarks ?? '',
          },
        ],
      });
  }

  async function createInvoice(
    app: ReturnType<CreateApp>,
    token: string,
    payload: {
      proformaInvoiceId: string;
      proformaInvoiceItemId: string;
      itemId: string;
      batchNo: string;
      invoiceQty: number;
      rate: number;
      taxPercent?: number;
    },
  ) {
    return request(app)
      .post('/invoices')
      .set(authHeader(token))
      .send({
        date: '2026-04-12',
        proformaInvoiceId: payload.proformaInvoiceId,
        items: [
          {
            proformaInvoiceItemId: payload.proformaInvoiceItemId,
            itemId: payload.itemId,
            batchNo: payload.batchNo,
            invoiceQty: payload.invoiceQty,
            rate: payload.rate,
            taxPercent: payload.taxPercent ?? 18,
          },
        ],
      });
  }

  it('creates a PI, allows edit before invoicing, and rejects edit after invoicing starts', async () => {
    const app = createApp();
    const context = await createCompanyContext('sales-edit');
    const customer = await createCustomer(context.company.id, { name: 'Acme Pharma' });
    const item = await createFinishedItem(context.company.id, { storeName: 'Capsule A' });
    await seedFinishedStock({
      companyId: context.company.id,
      itemId: item.id,
      itemName: item.storeName,
      batchNo: 'FG-CAP-001',
      receiptQty: 50,
      rate: 120,
    });

    const created = await createPi(app, context.adminToken, {
      customerId: customer.id,
      itemId: item.id,
      quantity: 30,
      rate: 120,
      remarks: 'Initial PI',
    });

    expect(created.status).toBe(201);
    expect(created.body.data.piNo).toBe('PI-00001');
    expect(created.body.data.items[0].remainingQty).toBe(30);
    expect(created.body.data.status).toBe('pending');

    const updated = await request(app)
      .put(`/proforma-invoices/${created.body.data.id}`)
      .set(authHeader(context.adminToken))
      .send({
        date: '2026-04-11',
        customerId: customer.id,
        items: [
          {
            itemId: item.id,
            quantity: 35,
            rate: 125,
            remarks: 'Edited before invoicing',
          },
        ],
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.date).toBe('2026-04-11');
    expect(updated.body.data.totalQuantity).toBe(35);
    expect(updated.body.data.items[0].quantity).toBe(35);
    expect(updated.body.data.items[0].remarks).toBe('Edited before invoicing');

    const partialInvoice = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: updated.body.data.id,
      proformaInvoiceItemId: updated.body.data.items[0].id,
      itemId: item.id,
      batchNo: 'FG-CAP-001',
      invoiceQty: 10,
      rate: 125,
    });

    expect(partialInvoice.status).toBe(201);
    expect(partialInvoice.body.data.status).toBe('partial');

    const blockedEdit = await request(app)
      .put(`/proforma-invoices/${created.body.data.id}`)
      .set(authHeader(context.adminToken))
      .send({
        date: '2026-04-11',
        customerId: customer.id,
        items: [
          {
            itemId: item.id,
            quantity: 40,
            rate: 130,
          },
        ],
      });

    expect(blockedEdit.status).toBe(400);
    expect(blockedEdit.body.message).toBe('PI can be edited only while it is open and invoicing has not started');
  });

  it('handles partial and final invoice conversion, updates PI quantities/status, posts ledger, and filters invoice history by PI', async () => {
    const app = createApp();
    const context = await createCompanyContext('sales-flow');
    const customer = await createCustomer(context.company.id, { name: 'Beta Labs' });
    const item = await createFinishedItem(context.company.id, { storeName: 'Sanitizer Bottle' });

    await seedFinishedStock({
      companyId: context.company.id,
      itemId: item.id,
      itemName: item.storeName,
      batchNo: 'FG-SAN-001',
      receiptQty: 60,
      rate: 250,
    });

    const piResponse = await createPi(app, context.adminToken, {
      customerId: customer.id,
      itemId: item.id,
      quantity: 60,
      rate: 250,
    });

    expect(piResponse.status).toBe(201);

    const pi = piResponse.body.data as {
      id: string;
      items: Array<{ id: string }>;
    };

    const firstInvoice = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: pi.id,
      proformaInvoiceItemId: pi.items[0].id,
      itemId: item.id,
      batchNo: 'FG-SAN-001',
      invoiceQty: 25,
      rate: 250,
    });

    expect(firstInvoice.status).toBe(201);
    expect(firstInvoice.body.data.invoiceNo).toBe('INV-00001');
    expect(firstInvoice.body.data.status).toBe('partial');
    expect(firstInvoice.body.data.totalQuantity).toBe(25);
    expect(firstInvoice.body.data.totalAmount).toBe(6250);
    expect(firstInvoice.body.data.taxAmount).toBe(1125);

    const piAfterFirstInvoice = await request(app)
      .get(`/proforma-invoices/${pi.id}`)
      .set(authHeader(context.adminToken));

    expect(piAfterFirstInvoice.status).toBe(200);
    expect(piAfterFirstInvoice.body.data.status).toBe('partial');
    expect(piAfterFirstInvoice.body.data.items[0].invoicedQty).toBe(25);
    expect(piAfterFirstInvoice.body.data.items[0].remainingQty).toBe(35);

    const firstInvoiceLedger = await prisma.stockLedgerEntry.findMany({
      where: {
        companyId: context.company.id,
        invoiceId: firstInvoice.body.data.id,
        type: StockLedgerEntryType.INVOICE,
      },
    });

    expect(firstInvoiceLedger).toHaveLength(1);
    expect(Number(firstInvoiceLedger[0].issueQty)).toBe(25);
    expect(firstInvoiceLedger[0].referenceNo).toBe('INV-00001');

    const secondInvoice = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: pi.id,
      proformaInvoiceItemId: pi.items[0].id,
      itemId: item.id,
      batchNo: 'FG-SAN-001',
      invoiceQty: 35,
      rate: 250,
    });

    expect(secondInvoice.status).toBe(201);
    expect(secondInvoice.body.data.invoiceNo).toBe('INV-00002');
    expect(secondInvoice.body.data.status).toBe('completed');

    const piAfterSecondInvoice = await request(app)
      .get(`/proforma-invoices/${pi.id}`)
      .set(authHeader(context.adminToken));

    expect(piAfterSecondInvoice.status).toBe(200);
    expect(piAfterSecondInvoice.body.data.status).toBe('completed');
    expect(piAfterSecondInvoice.body.data.items[0].invoicedQty).toBe(60);
    expect(piAfterSecondInvoice.body.data.items[0].remainingQty).toBe(0);

    const otherCustomer = await createCustomer(context.company.id, { name: 'Gamma Retail' });
    const otherPi = await createPi(app, context.adminToken, {
      customerId: otherCustomer.id,
      itemId: item.id,
      quantity: 5,
      rate: 260,
    });

    expect(otherPi.status).toBe(201);

    const invoiceHistory = await request(app)
      .get('/invoices')
      .query({ proformaInvoiceId: pi.id })
      .set(authHeader(context.adminToken));

    expect(invoiceHistory.status).toBe(200);
    expect(invoiceHistory.body.data).toHaveLength(2);
    expect(invoiceHistory.body.data.every((row: { piId: string }) => row.piId === pi.id)).toBe(true);
  });

  it('allows closing an open PI and rejects invoices for closed PIs or quantities above PI remaining or available stock', async () => {
    const app = createApp();
    const context = await createCompanyContext('sales-validate');
    const customer = await createCustomer(context.company.id, { name: 'Delta Healthcare' });
    const item = await createFinishedItem(context.company.id, { storeName: 'Surface Disinfectant' });

    await seedFinishedStock({
      companyId: context.company.id,
      itemId: item.id,
      itemName: item.storeName,
      batchNo: 'FG-DIS-001',
      receiptQty: 15,
      rate: 300,
    });

    const closedPiResponse = await createPi(app, context.adminToken, {
      customerId: customer.id,
      itemId: item.id,
      quantity: 10,
      rate: 300,
    });

    expect(closedPiResponse.status).toBe(201);

    const closeResponse = await request(app)
      .post(`/proforma-invoices/${closedPiResponse.body.data.id}/close`)
      .set(authHeader(context.adminToken))
      .send({});

    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.data.status).toBe('closed');

    const closedInvoiceAttempt = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: closedPiResponse.body.data.id,
      proformaInvoiceItemId: closedPiResponse.body.data.items[0].id,
      itemId: item.id,
      batchNo: 'FG-DIS-001',
      invoiceQty: 5,
      rate: 300,
    });

    expect(closedInvoiceAttempt.status).toBe(400);
    expect(closedInvoiceAttempt.body.message).toBe('Closed or completed PI cannot be invoiced');

    const remainingPiResponse = await createPi(app, context.adminToken, {
      customerId: customer.id,
      itemId: item.id,
      quantity: 20,
      rate: 300,
    });

    expect(remainingPiResponse.status).toBe(201);

    const aboveRemaining = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: remainingPiResponse.body.data.id,
      proformaInvoiceItemId: remainingPiResponse.body.data.items[0].id,
      itemId: item.id,
      batchNo: 'FG-DIS-001',
      invoiceQty: 25,
      rate: 300,
    });

    expect(aboveRemaining.status).toBe(400);
    expect(aboveRemaining.body.message).toContain('exceeds remaining PI quantity');

    const aboveStockPiResponse = await createPi(app, context.adminToken, {
      customerId: customer.id,
      itemId: item.id,
      quantity: 12,
      rate: 300,
    });

    expect(aboveStockPiResponse.status).toBe(201);

    const aboveStock = await createInvoice(app, context.adminToken, {
      proformaInvoiceId: aboveStockPiResponse.body.data.id,
      proformaInvoiceItemId: aboveStockPiResponse.body.data.items[0].id,
      itemId: item.id,
      batchNo: 'FG-DIS-001',
      invoiceQty: 16,
      rate: 300,
    });

    expect(aboveStock.status).toBe(400);
    expect(aboveStock.body.message).toContain('exceeds available stock');
  });
});

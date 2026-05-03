import { AccountType, ItemType, StockLedgerEntryType } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type CreateApp = typeof import('../src/app').createApp;
type PrismaInstance = typeof import('../src/lib/prisma').prisma;
type HashPassword = typeof import('../src/lib/password').hashPassword;
type CreateAccessToken = typeof import('../src/lib/tokens').createAccessToken;

describeIfDb('production lifecycle integration', () => {
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
          description: 'Production integration test role',
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

  async function createItem(companyId: string, input: {
    storeName: string;
    tallyName: string;
    sku: string;
    itemType: ItemType;
    baseUnit?: string;
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
        itemType: input.itemType,
        baseUnit: input.baseUnit ?? 'kg',
        hsnCode: input.itemType === ItemType.RAW ? '7214' : '3004',
        gstRate: 18,
        isActive: input.isActive ?? true,
      },
    });
  }

  async function seedLedgerEntry(app: ReturnType<CreateApp>, token: string, input: {
    itemId: string;
    itemName: string;
    itemCategory: 'RAW' | 'FINISHED';
    referenceNo: string;
    type: 'purchase' | 'invoice';
    particulars: string;
    batchNo: string;
    mfgDate: string;
    expiryDate: string;
    receiptQty?: number;
    issueQty?: number;
    productionBatchId?: string;
  }) {
    return request(app)
      .post('/ledger')
      .set(authHeader(token))
      .send({
        entries: [
          {
            itemId: input.itemId,
            date: '2026-04-01',
            referenceNo: input.referenceNo,
            type: input.type,
            particulars: input.particulars,
            itemName: input.itemName,
            itemCategory: input.itemCategory,
            batchNo: input.batchNo,
            mfgDate: input.mfgDate,
            expiryDate: input.expiryDate,
            receiptQty: input.receiptQty ?? 0,
            issueQty: input.issueQty ?? 0,
            rate: 10,
            remarks: 'Integration seed',
            productionBatchId: input.productionBatchId ?? '',
          },
        ],
      });
  }

  function buildBmrPayload(input: {
    productName: string;
    batchNo: string;
    batchSize: string;
    mfgDate: string;
    expDate: string;
    materialName: string;
    issuedQty: number;
    actualQty: number;
  }) {
    return {
      data: {
        batchInfo: {
          productName: input.productName,
          batchNo: input.batchNo,
          batchSize: input.batchSize,
          mfgDate: input.mfgDate,
          expDate: input.expDate,
        },
        rawMaterials: [
          {
            id: 'rm-1',
            materialName: input.materialName,
            requiredQty: input.issuedQty,
            issuedQty: input.issuedQty,
            usedQty: input.issuedQty,
            returnedQty: 0,
          },
        ],
        processSteps: [
          {
            id: 'ps-1',
            stepName: 'Mixing',
            startTime: '09:00',
            endTime: '10:00',
            operatorName: 'Operator 1',
            checkedBy: 'Supervisor 1',
            remarks: 'Within limits',
          },
        ],
        sterilization: {
          date: input.mfgDate,
          quantity: input.actualQty,
          reference: 'STER-001',
        },
        packing: {
          packingType: 'Box',
          quantity: input.actualQty,
          doneBy: 'Packing Lead',
        },
        labelling: {
          labelDetails: 'Primary label',
          checkedBy: 'QA Inspector',
        },
        finalOutput: {
          expectedQty: input.actualQty,
          actualQty: input.actualQty,
          rejectedQty: 0,
        },
        qa: {
          status: 'PENDING',
          remarks: 'Awaiting final QA release',
          approvedBy: 'QA Reviewer',
        },
      },
    };
  }

  async function createBatchWithFinishedItem(app: ReturnType<CreateApp>, context: {
    company: { id: string };
    adminToken: string;
  }, overrides?: {
    batchNo?: string;
    batchSize?: string;
  }) {
    const finishedItem = await createItem(context.company.id, {
      storeName: 'Finished Product A',
      tallyName: 'FINISHED-PRODUCT-A',
      sku: 'FG-001',
      itemType: ItemType.FINISHED,
      baseUnit: 'pcs',
    });

    const response = await request(app)
      .post('/production')
      .set(authHeader(context.adminToken))
      .send({
        itemId: finishedItem.id,
        batchNo: overrides?.batchNo ?? 'FG-001',
        batchSize: overrides?.batchSize ?? '100 pcs',
        startDate: '2026-04-01',
        mfgDate: '2026-04-01',
        expDate: '2028-04-01',
      });

    expect(response.status).toBe(201);

    return {
      finishedItem,
      batch: response.body.data as {
        id: string;
        itemId: string;
        productionNo: string;
        batchNo: string;
        productName: string;
        batchSize: string;
        startDate: string;
        mfgDate: string;
        expDate: string;
        status: string;
      },
    };
  }

  it('enforces production, MRS, stock movement, and ledger permissions for company users', async () => {
    const app = createApp();
    const company = await createCompanyContext({
      suffix: 'prod-perms',
      withCompanyUser: true,
      userPermissions: ['production.view', 'mrs.view'],
    });

    const productionList = await request(app)
      .get('/production')
      .set(authHeader(company.userToken!));

    expect(productionList.status).toBe(200);
    expect(productionList.body.data).toEqual([]);

    const productionCreate = await request(app)
      .post('/production')
      .set(authHeader(company.userToken!))
      .send({});

    expect(productionCreate.status).toBe(403);
    expect(productionCreate.body.message).toContain('production.create');

    const mrsList = await request(app)
      .get('/mrs')
      .set(authHeader(company.userToken!));

    expect(mrsList.status).toBe(200);
    expect(mrsList.body.data).toEqual([]);

    const mrsCreate = await request(app)
      .post('/mrs')
      .set(authHeader(company.userToken!))
      .send({});

    expect(mrsCreate.status).toBe(403);
    expect(mrsCreate.body.message).toContain('mrs.create');

    const movementCreate = await request(app)
      .post('/stock-movements')
      .set(authHeader(company.userToken!))
      .send({});

    expect(movementCreate.status).toBe(403);
    expect(movementCreate.body.message).toContain('stock_movement.create');

    const ledgerCreate = await request(app)
      .post('/ledger')
      .set(authHeader(company.userToken!))
      .send({ entries: [] });

    expect(ledgerCreate.status).toBe(403);
    expect(ledgerCreate.body.message).toContain('stock_ledger.create');
  });

  it('persists batch, MRS, issue, BMR, QA release, and invoice ledger transitions end-to-end', async () => {
    const app = createApp();
    const context = await createCompanyContext({ suffix: 'prod-happy' });
    const rawItem = await createItem(context.company.id, {
      storeName: 'Raw Material A',
      tallyName: 'RAW-MATERIAL-A',
      sku: 'RM-001',
      itemType: ItemType.RAW,
    });
    const { finishedItem, batch } = await createBatchWithFinishedItem(app, context);

    const purchaseLedger = await seedLedgerEntry(app, context.adminToken, {
      itemId: rawItem.id,
      itemName: rawItem.storeName,
      itemCategory: 'RAW',
      referenceNo: 'PUR-001',
      type: 'purchase',
      particulars: 'Vendor',
      batchNo: 'RAW-001',
      mfgDate: '2026-03-01',
      expiryDate: '2027-03-01',
      receiptQty: 100,
    });

    expect(purchaseLedger.status).toBe(201);
    expect(purchaseLedger.body.meta.count).toBe(1);

    const productionList = await request(app)
      .get('/production')
      .set(authHeader(context.adminToken));

    expect(productionList.status).toBe(200);
    expect(productionList.body.data).toHaveLength(1);
    expect(productionList.body.data[0].productionNo).toBe('PRD-00001');

    const mrsCreate = await request(app)
      .post('/mrs')
      .set(authHeader(context.adminToken))
      .send({
        productionBatchId: batch.id,
        date: '2026-04-02',
        department: 'Production',
        requisitionBy: 'Supervisor',
        items: [
          {
            itemId: rawItem.id,
            qtyRequested: 80,
            remarks: 'Main consumption',
          },
        ],
      });

    expect(mrsCreate.status).toBe(201);
    expect(mrsCreate.body.data.mrsNo).toBe('MRS-00001');
    expect(mrsCreate.body.data.status).toBe('pending');

    const batchMrs = await request(app)
      .get(`/production/${batch.id}/mrs`)
      .set(authHeader(context.adminToken));

    expect(batchMrs.status).toBe(200);
    expect(batchMrs.body.data).toHaveLength(1);

    const issueBeforeApproval = await request(app)
      .post('/stock-movements')
      .set(authHeader(context.adminToken))
      .send({
        type: 'issue',
        materialRequisitionId: mrsCreate.body.data.id,
        date: '2026-04-02',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-001',
            quantity: 80,
          },
        ],
      });

    expect(issueBeforeApproval.status).toBe(400);
    expect(issueBeforeApproval.body.message).toBe('Approve MRS before issuing materials');

    const approveMrs = await request(app)
      .post(`/mrs/${mrsCreate.body.data.id}/approve`)
      .set(authHeader(context.adminToken))
      .send({ approvedBy: 'Production Manager' });

    expect(approveMrs.status).toBe(200);
    expect(approveMrs.body.data.status).toBe('approved');
    expect(approveMrs.body.data.approvedBy).toBe('Production Manager');

    const issueMovement = await request(app)
      .post('/stock-movements')
      .set(authHeader(context.adminToken))
      .send({
        type: 'issue',
        materialRequisitionId: mrsCreate.body.data.id,
        productionBatchId: batch.id,
        date: '2026-04-03',
        issuedBy: 'Store Admin',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-001',
            quantity: 80,
          },
        ],
      });

    expect(issueMovement.status).toBe(201);
    expect(issueMovement.body.data.movementNo).toBe('MOV-00001');
    expect(issueMovement.body.data.type).toBe('issue');
    expect(issueMovement.body.data.quantity).toBe(80);

    const transferMovement = await request(app)
      .post('/stock-movements')
      .set(authHeader(context.adminToken))
      .send({
        type: 'transfer',
        date: '2026-04-03',
        fromLocation: 'Store',
        toLocation: 'Production',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-001',
            quantity: 5,
          },
        ],
      });

    expect(transferMovement.status).toBe(201);
    expect(transferMovement.body.data.movementNo).toBe('MOV-00002');
    expect(transferMovement.body.data.type).toBe('transfer');

    const mrsDetail = await request(app)
      .get(`/mrs/${mrsCreate.body.data.id}`)
      .set(authHeader(context.adminToken));

    expect(mrsDetail.status).toBe(200);
    expect(mrsDetail.body.data.status).toBe('issued');
    expect(mrsDetail.body.data.items[0].qtyIssued).toBe(80);
    expect(mrsDetail.body.data.items[0].remainingQty).toBe(0);

    const submitBmr = await request(app)
      .post(`/production/${batch.id}/bmr/submit`)
      .set(authHeader(context.adminToken))
      .send(
        buildBmrPayload({
          productName: batch.productName,
          batchNo: batch.batchNo,
          batchSize: batch.batchSize,
          mfgDate: batch.mfgDate,
          expDate: batch.expDate,
          materialName: rawItem.storeName,
          issuedQty: 80,
          actualQty: 50,
        }),
      );

    expect(submitBmr.status).toBe(200);
    expect(submitBmr.body.data.status).toBe('SUBMITTED');

    const qaApprove = await request(app)
      .post(`/production/${batch.id}/qa`)
      .set(authHeader(context.adminToken))
      .send({
        status: 'APPROVED',
        remarks: 'Released for sale',
        approvedBy: 'QA Head',
      });

    expect(qaApprove.status).toBe(200);
    expect(qaApprove.body.data.status).toBe('RELEASED');
    expect(qaApprove.body.data.actualQty).toBe(50);

    const invoiceLedger = await seedLedgerEntry(app, context.adminToken, {
      itemId: finishedItem.id,
      itemName: finishedItem.storeName,
      itemCategory: 'FINISHED',
      referenceNo: 'INV-001',
      type: 'invoice',
      particulars: 'Sales',
      batchNo: batch.batchNo,
      mfgDate: batch.mfgDate,
      expiryDate: batch.expDate,
      issueQty: 15,
      productionBatchId: batch.id,
    });

    expect(invoiceLedger.status).toBe(201);

    const ledgerList = await request(app)
      .get('/ledger')
      .query({ paginate: 'false' })
      .set(authHeader(context.adminToken));

    expect(ledgerList.status).toBe(200);
    expect(ledgerList.body.total).toBe(5);

    const rawBalance = ledgerList.body.data
      .filter((entry: { itemName: string; batchNo: string }) => entry.itemName === rawItem.storeName && entry.batchNo === 'RAW-001')
      .reduce((sum: number, entry: { receiptQty: number; issueQty: number }) => sum + entry.receiptQty - entry.issueQty, 0);
    const finishedBalance = ledgerList.body.data
      .filter((entry: { itemName: string; batchNo: string }) => entry.itemName === finishedItem.storeName && entry.batchNo === batch.batchNo)
      .reduce((sum: number, entry: { receiptQty: number; issueQty: number }) => sum + entry.receiptQty - entry.issueQty, 0);

    expect(rawBalance).toBe(20);
    expect(finishedBalance).toBe(35);
    expect(
      ledgerList.body.data.find((entry: { type: string; referenceNo: string }) => entry.type === 'transfer' && entry.referenceNo === 'MOV-00002'),
    ).toMatchObject({
      sourceModule: 'stock-movement',
      sourcePath: `/stock-movement/${transferMovement.body.data.id}`,
      receiptQty: 0,
      issueQty: 0,
    });

    const productionLedgerRows = await prisma.stockLedgerEntry.findMany({
      where: {
        companyId: context.company.id,
        productionBatchId: batch.id,
        type: StockLedgerEntryType.PRODUCTION,
      },
    });

    expect(productionLedgerRows).toHaveLength(1);
    expect(Number(productionLedgerRows[0].receiptQty)).toBe(50);
  });

  it('rejects invalid movement/BMR actions, blocks QA release on rejection, and enforces company isolation', async () => {
    const app = createApp();
    const alpha = await createCompanyContext({ suffix: 'prod-alpha' });
    const beta = await createCompanyContext({ suffix: 'prod-beta' });
    const rawItem = await createItem(alpha.company.id, {
      storeName: 'Raw Material B',
      tallyName: 'RAW-MATERIAL-B',
      sku: 'RM-002',
      itemType: ItemType.RAW,
    });
    const { batch } = await createBatchWithFinishedItem(app, alpha, { batchNo: 'FG-002', batchSize: '60 pcs' });

    const mrsCreate = await request(app)
      .post('/mrs')
      .set(authHeader(alpha.adminToken))
      .send({
        productionBatchId: batch.id,
        date: '2026-04-02',
        department: 'Production',
        requisitionBy: 'Supervisor',
        items: [
          {
            itemId: rawItem.id,
            qtyRequested: 30,
          },
        ],
      });

    expect(mrsCreate.status).toBe(201);

    const submitWithoutIssue = await request(app)
      .post(`/production/${batch.id}/bmr/submit`)
      .set(authHeader(alpha.adminToken))
      .send(
        buildBmrPayload({
          productName: batch.productName,
          batchNo: batch.batchNo,
          batchSize: batch.batchSize,
          mfgDate: batch.mfgDate,
          expDate: batch.expDate,
          materialName: rawItem.storeName,
          issuedQty: 30,
          actualQty: 20,
        }),
      );

    expect(submitWithoutIssue.status).toBe(400);
    expect(submitWithoutIssue.body.message).toBe('Record stock issue before submitting BMR');

    const approveMrs = await request(app)
      .post(`/mrs/${mrsCreate.body.data.id}/approve`)
      .set(authHeader(alpha.adminToken))
      .send({});

    expect(approveMrs.status).toBe(200);

    const purchaseLedger = await seedLedgerEntry(app, alpha.adminToken, {
      itemId: rawItem.id,
      itemName: rawItem.storeName,
      itemCategory: 'RAW',
      referenceNo: 'PUR-002',
      type: 'purchase',
      particulars: 'Vendor',
      batchNo: 'RAW-002',
      mfgDate: '2026-03-01',
      expiryDate: '2027-03-01',
      receiptQty: 20,
    });

    expect(purchaseLedger.status).toBe(201);

    const exceedsAvailable = await request(app)
      .post('/stock-movements')
      .set(authHeader(alpha.adminToken))
      .send({
        type: 'issue',
        materialRequisitionId: mrsCreate.body.data.id,
        productionBatchId: batch.id,
        date: '2026-04-03',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-002',
            quantity: 25,
          },
        ],
      });

    expect(exceedsAvailable.status).toBe(400);
    expect(exceedsAvailable.body.message).toContain('exceeds available stock');

    await seedLedgerEntry(app, alpha.adminToken, {
      itemId: rawItem.id,
      itemName: rawItem.storeName,
      itemCategory: 'RAW',
      referenceNo: 'PUR-003',
      type: 'purchase',
      particulars: 'Vendor',
      batchNo: 'RAW-003',
      mfgDate: '2026-03-01',
      expiryDate: '2027-03-01',
      receiptQty: 50,
    });

    const exceedsMrsRemaining = await request(app)
      .post('/stock-movements')
      .set(authHeader(alpha.adminToken))
      .send({
        type: 'issue',
        materialRequisitionId: mrsCreate.body.data.id,
        productionBatchId: batch.id,
        date: '2026-04-03',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-003',
            quantity: 35,
          },
        ],
      });

    expect(exceedsMrsRemaining.status).toBe(400);
    expect(exceedsMrsRemaining.body.message).toContain('exceeds remaining MRS quantity');

    const validIssue = await request(app)
      .post('/stock-movements')
      .set(authHeader(alpha.adminToken))
      .send({
        type: 'issue',
        materialRequisitionId: mrsCreate.body.data.id,
        productionBatchId: batch.id,
        date: '2026-04-03',
        items: [
          {
            itemId: rawItem.id,
            batchNo: 'RAW-003',
            quantity: 30,
          },
        ],
      });

    expect(validIssue.status).toBe(201);

    const submitBmr = await request(app)
      .post(`/production/${batch.id}/bmr/submit`)
      .set(authHeader(alpha.adminToken))
      .send(
        buildBmrPayload({
          productName: batch.productName,
          batchNo: batch.batchNo,
          batchSize: batch.batchSize,
          mfgDate: batch.mfgDate,
          expDate: batch.expDate,
          materialName: rawItem.storeName,
          issuedQty: 30,
          actualQty: 20,
        }),
      );

    expect(submitBmr.status).toBe(200);

    const rejectQa = await request(app)
      .post(`/production/${batch.id}/qa`)
      .set(authHeader(alpha.adminToken))
      .send({
        status: 'REJECTED',
        remarks: 'Failed QA',
        approvedBy: 'QA Head',
      });

    expect(rejectQa.status).toBe(200);
    expect(rejectQa.body.data.status).toBe('BLOCKED');

    const blockedLedgerCount = await prisma.stockLedgerEntry.count({
      where: {
        companyId: alpha.company.id,
        productionBatchId: batch.id,
        type: StockLedgerEntryType.PRODUCTION,
      },
    });

    expect(blockedLedgerCount).toBe(0);

    const betaAccess = await request(app)
      .get(`/production/${batch.id}`)
      .set(authHeader(beta.adminToken));

    expect(betaAccess.status).toBe(404);
    expect(betaAccess.body.message).toBe('Production batch not found');
  });
});

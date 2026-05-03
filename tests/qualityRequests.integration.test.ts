import { AccountType } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type CreateApp = typeof import('../src/app').createApp;
type PrismaInstance = typeof import('../src/lib/prisma').prisma;
type HashPassword = typeof import('../src/lib/password').hashPassword;
type CreateAccessToken = typeof import('../src/lib/tokens').createAccessToken;

describeIfDb('quality requests integration', () => {
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
    await prisma.qualityRequest.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.designation.deleteMany();
    await prisma.department.deleteMany();
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
          name: `QA Operator ${suffix}`,
          description: 'Quality test role',
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

  it('enforces quality request permissions for company users', async () => {
    const app = createApp();
    const context = await createCompanyContext({
      suffix: 'qa-perms',
      withCompanyUser: true,
      userPermissions: ['quality_requests.view'],
    });

    const listResponse = await request(app)
      .get('/quality-requests')
      .set(authHeader(context.userToken!));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([]);

    const createResponse = await request(app)
      .post('/quality-requests')
      .set(authHeader(context.userToken!))
      .send({});

    expect(createResponse.status).toBe(403);
    expect(createResponse.body.message).toContain('quality_requests.create');

    const approveResponse = await request(app)
      .patch('/quality-requests/missing/approve')
      .set(authHeader(context.userToken!))
      .send({});

    expect(approveResponse.status).toBe(403);
    expect(approveResponse.body.message).toContain('quality_requests.approve');
  });

  it('creates, approves, reports, and closes a quality request end-to-end', async () => {
    const app = createApp();
    const context = await createCompanyContext({ suffix: 'qa-flow' });

    const createResponse = await request(app)
      .post('/quality-requests')
      .set(authHeader(context.adminToken))
      .send({
        date: '2026-05-01',
        itemName: 'Finished Product A',
        batchNo: 'FG-001',
        quantity: 25,
        issueType: 'testing',
        description: 'Routine finished goods release testing.',
        remarks: 'Hold before dispatch',
        requestedBy: 'QA Lead',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.requestNo).toBe('QREQ-00001');
    expect(createResponse.body.data.status).toBe('pending');
    expect(createResponse.body.data.quantity).toBe(25);

    const requestId = createResponse.body.data.id as string;

    const approveResponse = await request(app)
      .patch(`/quality-requests/${requestId}/approve`)
      .set(authHeader(context.adminToken))
      .send({
        approvedBy: 'QA Manager',
        approvalRemarks: 'Proceed with release checks',
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.data.status).toBe('approved');
    expect(approveResponse.body.data.approvedBy).toBe('QA Manager');

    const reportResponse = await request(app)
      .post(`/quality-requests/${requestId}/report`)
      .set(authHeader(context.adminToken))
      .send({
        testParameters: 'Visual, seal integrity, weight variation',
        observations: 'All observations are within tolerance.',
        result: 'pass',
        attachments: ['checklist.pdf', 'photos.zip'],
      });

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.data.status).toBe('completed');
    expect(reportResponse.body.data.testResult).toBe('pass');
    expect(reportResponse.body.data.attachments).toEqual(['checklist.pdf', 'photos.zip']);

    const closeResponse = await request(app)
      .patch(`/quality-requests/${requestId}/close`)
      .set(authHeader(context.adminToken))
      .send({
        decision: 'accept',
        remarks: 'Released for dispatch',
      });

    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.data.status).toBe('closed');
    expect(closeResponse.body.data.closureDecision).toBe('accept');
    expect(closeResponse.body.data.closureRemarks).toBe('Released for dispatch');

    const listResponse = await request(app)
      .get('/quality-requests')
      .set(authHeader(context.adminToken));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: requestId,
      requestNo: 'QREQ-00001',
      status: 'closed',
      testResult: 'pass',
    });

    const stored = await prisma.qualityRequest.findUnique({
      where: { id: requestId },
    });

    expect(stored?.status).toBe('CLOSED');
    expect(stored?.requestSequence).toBe(1);
    expect(stored?.attachments).toEqual(['checklist.pdf', 'photos.zip']);
  });

  it('rejects invalid transitions and enforces company isolation', async () => {
    const app = createApp();
    const alpha = await createCompanyContext({ suffix: 'qa-alpha' });
    const beta = await createCompanyContext({ suffix: 'qa-beta' });

    const createResponse = await request(app)
      .post('/quality-requests')
      .set(authHeader(alpha.adminToken))
      .send({
        date: '2026-05-02',
        itemName: 'Raw Material B',
        batchNo: 'RM-002',
        issueType: 'defect',
        description: 'Discoloration found during inspection.',
        remarks: '',
        requestedBy: 'Store Incharge',
      });

    expect(createResponse.status).toBe(201);
    const requestId = createResponse.body.data.id as string;

    const reportBeforeApprove = await request(app)
      .post(`/quality-requests/${requestId}/report`)
      .set(authHeader(alpha.adminToken))
      .send({
        testParameters: 'Visual check',
        observations: 'Waiting for approval',
        result: 'fail',
        attachments: [],
      });

    expect(reportBeforeApprove.status).toBe(400);
    expect(reportBeforeApprove.body.message).toBe('Only approved quality requests can receive a test report');

    const crossCompanyAccess = await request(app)
      .get(`/quality-requests/${requestId}`)
      .set(authHeader(beta.adminToken));

    expect(crossCompanyAccess.status).toBe(404);
    expect(crossCompanyAccess.body.message).toBe('Quality request not found');

    const closeBeforeComplete = await request(app)
      .patch(`/quality-requests/${requestId}/close`)
      .set(authHeader(alpha.adminToken))
      .send({
        decision: 'reject',
        remarks: 'Cannot close yet',
      });

    expect(closeBeforeComplete.status).toBe(400);
    expect(closeBeforeComplete.body.message).toBe('Only completed quality requests can be closed');
  });
});

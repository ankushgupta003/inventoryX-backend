import { Router } from 'express';
import { AccountType, CompanyStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { generateTemporaryPassword } from '../lib/random';

const companyCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  admin: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().nullable(),
    temporaryPassword: z.string().min(8).optional(),
  }),
});

const companyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).optional(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

const passwordResetSchema = z.object({
  temporaryPassword: z.string().min(8).optional(),
});

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '-');
}

export const superAdminRouter = Router();

superAdminRouter.get('/dashboard', async (_req, res) => {
  const [totalCompanies, activeCompanies, suspendedCompanies, totalUsers, recentCompanies] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: CompanyStatus.ACTIVE } }),
    prisma.company.count({ where: { status: CompanyStatus.SUSPENDED } }),
    prisma.user.count({ where: { accountType: { in: [AccountType.COMPANY_ADMIN, AccountType.COMPANY_USER] } } }),
    prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        adminUser: {
          select: { id: true, fullName: true, email: true, isActive: true },
        },
        _count: {
          select: { users: true, departments: true, designations: true, roles: true },
        },
      },
    }),
  ]);

  res.json({
    data: {
      summary: {
        totalCompanies,
        activeCompanies,
        suspendedCompanies,
        totalUsers,
      },
      recentCompanies,
    },
  });
});

superAdminRouter.get('/companies', async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      adminUser: {
        select: { id: true, fullName: true, email: true, phone: true, isActive: true, mustResetPassword: true },
      },
      _count: {
        select: { users: true, departments: true, designations: true, roles: true },
      },
    },
  });

  res.json({ data: companies });
});

superAdminRouter.post('/companies', async (req, res, next) => {
  try {
    const payload = companyCreateSchema.parse(req.body);
    const temporaryPassword = payload.admin.temporaryPassword ?? generateTemporaryPassword();
    const adminPasswordHash = await hashPassword(temporaryPassword);
    const companyCode = normalizeCode(payload.code);
    const adminEmail = payload.admin.email.toLowerCase();

    const data = await prisma.$transaction(async (tx) => {
      const existingAdmin = await tx.user.findUnique({ where: { email: adminEmail } });
      if (existingAdmin) {
        throw new AppError(409, 'Admin email already exists');
      }

      const company = await tx.company.create({
        data: {
          name: payload.name.trim(),
          code: companyCode,
          contactEmail: payload.contactEmail ?? null,
          contactPhone: payload.contactPhone ?? null,
          address: payload.address ?? null,
          status: CompanyStatus.ACTIVE,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash: adminPasswordHash,
          accountType: AccountType.COMPANY_ADMIN,
          companyId: company.id,
          fullName: payload.admin.fullName.trim(),
          phone: payload.admin.phone ?? null,
          isActive: true,
          mustResetPassword: true,
        },
      });

      return tx.company.update({
        where: { id: company.id },
        data: {
          adminUserId: adminUser.id,
        },
        include: {
          adminUser: {
            select: { id: true, fullName: true, email: true, phone: true, mustResetPassword: true, isActive: true },
          },
          _count: {
            select: { users: true, departments: true, designations: true, roles: true },
          },
        },
      });
    });

    res.status(201).json({
      data: {
        company: data,
        adminTemporaryPassword: temporaryPassword,
      },
    });
  } catch (error) {
    next(error);
  }
});

superAdminRouter.get('/companies/:id', async (req, res) => {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      adminUser: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          mustResetPassword: true,
          updatedAt: true,
        },
      },
      _count: {
        select: {
          users: true,
          departments: true,
          designations: true,
          roles: true,
        },
      },
    },
  });

  res.json({ data: company });
});

superAdminRouter.patch('/companies/:id', async (req, res, next) => {
  try {
    const payload = companyUpdateSchema.parse(req.body);
    const updated = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.code ? { code: normalizeCode(payload.code) } : {}),
        ...(payload.contactEmail !== undefined ? { contactEmail: payload.contactEmail ?? null } : {}),
        ...(payload.contactPhone !== undefined ? { contactPhone: payload.contactPhone ?? null } : {}),
        ...(payload.address !== undefined ? { address: payload.address ?? null } : {}),
      },
      include: {
        adminUser: {
          select: { id: true, fullName: true, email: true, phone: true, isActive: true, mustResetPassword: true },
        },
        _count: {
          select: { users: true, departments: true, designations: true, roles: true },
        },
      },
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

superAdminRouter.post('/companies/:id/reset-admin-password', async (req, res, next) => {
  try {
    const payload = passwordResetSchema.parse(req.body);
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { adminUser: true },
    });

    if (!company?.adminUser) {
      throw new AppError(404, 'Company admin not found');
    }

    const temporaryPassword = payload.temporaryPassword ?? generateTemporaryPassword();

    await prisma.user.update({
      where: { id: company.adminUser.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustResetPassword: true,
      },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: company.adminUser.id },
    });

    res.json({ data: { success: true, temporaryPassword } });
  } catch (error) {
    next(error);
  }
});

superAdminRouter.post('/companies/:id/suspend', async (req, res) => {
  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { status: CompanyStatus.SUSPENDED },
  });
  res.json({ data: company });
});

superAdminRouter.post('/companies/:id/activate', async (req, res) => {
  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { status: CompanyStatus.ACTIVE },
  });
  res.json({ data: company });
});

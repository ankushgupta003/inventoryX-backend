import { Router } from 'express';
import { AccountType, ItemType } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { generateTemporaryPassword } from '../lib/random';
import { mapUniqueConstraintError, normalizeLookupValue } from '../modules/shared/masterData';
import { permissionCatalog, normalizePermissionKeys, splitPermissionKey } from '../utils/permissions';

const baseMasterSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

const departmentCreateSchema = baseMasterSchema.extend({
  code: z.string().optional().nullable(),
});

const departmentUpdateSchema = departmentCreateSchema.partial();

const designationCreateSchema = baseMasterSchema;
const designationUpdateSchema = designationCreateSchema.partial();

const itemCategoryCreateSchema = baseMasterSchema.extend({
  itemType: z.enum(['raw', 'finished']),
});

const itemCategoryUpdateSchema = itemCategoryCreateSchema.partial();

const roleCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  permissions: z.array(z.string()).default([]),
});

const roleUpdateSchema = roleCreateSchema.partial();

const userCreateSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  employeeCode: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  roleId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  temporaryPassword: z.string().min(8).optional(),
});

const userUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  employeeCode: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  roleId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).optional(),
});

async function ensureDepartment(companyId: string, departmentId?: string | null) {
  if (!departmentId) return null;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, companyId },
  });
  if (!department) throw new AppError(400, 'Invalid department');
  return department.id;
}

async function ensureDesignation(companyId: string, designationId?: string | null) {
  if (!designationId) return null;
  const designation = await prisma.designation.findFirst({
    where: { id: designationId, companyId },
  });
  if (!designation) throw new AppError(400, 'Invalid designation');
  return designation.id;
}

async function ensureRole(companyId: string, roleId?: string | null) {
  if (!roleId) return null;
  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId },
  });
  if (!role) throw new AppError(400, 'Invalid role');
  return role.id;
}

export const adminRouter = Router();

adminRouter.get('/permissions/catalog', (_req, res) => {
  res.json({ data: permissionCatalog });
});

adminRouter.get('/departments', async (req, res) => {
  const departments = await prisma.department.findMany({
    where: { companyId: req.auth!.companyId! },
    orderBy: { name: 'asc' },
  });
  res.json({ data: departments });
});

adminRouter.post('/departments', async (req, res, next) => {
  try {
    const payload = departmentCreateSchema.parse(req.body);
    const department = await prisma.department.create({
      data: {
        companyId: req.auth!.companyId!,
        name: payload.name.trim(),
        code: payload.code ?? null,
        isActive: payload.isActive ?? true,
      },
    });
    res.status(201).json({ data: department });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/departments/:id', async (req, res, next) => {
  try {
    const payload = departmentUpdateSchema.parse(req.body);
    const department = await prisma.department.findFirst({
      where: { id: req.params.id, companyId: req.auth!.companyId! },
    });
    if (!department) throw new AppError(404, 'Department not found');

    const updated = await prisma.department.update({
      where: { id: department.id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.code !== undefined ? { code: payload.code ?? null } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/designations', async (req, res) => {
  const designations = await prisma.designation.findMany({
    where: { companyId: req.auth!.companyId! },
    orderBy: { name: 'asc' },
  });
  res.json({ data: designations });
});

adminRouter.post('/designations', async (req, res, next) => {
  try {
    const payload = designationCreateSchema.parse(req.body);
    const designation = await prisma.designation.create({
      data: {
        companyId: req.auth!.companyId!,
        name: payload.name.trim(),
        isActive: payload.isActive ?? true,
      },
    });
    res.status(201).json({ data: designation });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/designations/:id', async (req, res, next) => {
  try {
    const payload = designationUpdateSchema.parse(req.body);
    const designation = await prisma.designation.findFirst({
      where: { id: req.params.id, companyId: req.auth!.companyId! },
    });
    if (!designation) throw new AppError(404, 'Designation not found');

    const updated = await prisma.designation.update({
      where: { id: designation.id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/item-categories', async (req, res) => {
  const itemCategories = await prisma.itemCategory.findMany({
    where: { companyId: req.auth!.companyId! },
    orderBy: [{ itemType: 'asc' }, { nameNormalized: 'asc' }],
  });
  res.json({
    data: itemCategories.map((category) => ({
      ...category,
      itemType: category.itemType === ItemType.RAW ? 'raw' : 'finished',
    })),
  });
});

adminRouter.post('/item-categories', async (req, res, next) => {
  try {
    const payload = itemCategoryCreateSchema.parse(req.body);
    const itemCategory = await prisma.itemCategory.create({
      data: {
        companyId: req.auth!.companyId!,
        name: payload.name.trim(),
        nameNormalized: normalizeLookupValue(payload.name),
        itemType: payload.itemType === 'raw' ? ItemType.RAW : ItemType.FINISHED,
        isActive: payload.isActive ?? true,
      },
    });
    res.status(201).json({
      data: {
        ...itemCategory,
        itemType: itemCategory.itemType === ItemType.RAW ? 'raw' : 'finished',
      },
    });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          nameNormalized: 'Category already exists for this item type',
        },
        'Category already exists for this item type',
      );
    } catch (mappedError) {
      return next(mappedError);
    }
    next(error);
  }
});

adminRouter.patch('/item-categories/:id', async (req, res, next) => {
  try {
    const payload = itemCategoryUpdateSchema.parse(req.body);
    const itemCategory = await prisma.itemCategory.findFirst({
      where: { id: req.params.id, companyId: req.auth!.companyId! },
    });
    if (!itemCategory) throw new AppError(404, 'Item category not found');

    const updated = await prisma.itemCategory.update({
      where: { id: itemCategory.id },
      data: {
        ...(payload.name ? { name: payload.name.trim(), nameNormalized: normalizeLookupValue(payload.name) } : {}),
        ...(payload.itemType ? { itemType: payload.itemType === 'raw' ? ItemType.RAW : ItemType.FINISHED } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    res.json({
      data: {
        ...updated,
        itemType: updated.itemType === ItemType.RAW ? 'raw' : 'finished',
      },
    });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          nameNormalized: 'Category already exists for this item type',
        },
        'Category already exists for this item type',
      );
    } catch (mappedError) {
      return next(mappedError);
    }
    next(error);
  }
});

adminRouter.get('/roles', async (req, res) => {
  const roles = await prisma.role.findMany({
    where: { companyId: req.auth!.companyId! },
    orderBy: { name: 'asc' },
    include: {
      permissions: true,
    },
  });

  res.json({
    data: roles.map((role) => ({
      ...role,
      permissions: role.permissions.map((permission) => `${permission.module}.${permission.action}`),
    })),
  });
});

adminRouter.post('/roles', async (req, res, next) => {
  try {
    const payload = roleCreateSchema.parse(req.body);
    const permissionKeys = normalizePermissionKeys(payload.permissions);
    const companyId = req.auth!.companyId!;

    const created = await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          companyId,
          name: payload.name.trim(),
          description: payload.description ?? null,
          isActive: payload.isActive ?? true,
        },
      });

      if (permissionKeys.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionKeys.map((key) => {
            const { module, action } = splitPermissionKey(key);
            return {
              companyId,
              roleId: role.id,
              module,
              action,
            };
          }),
        });
      }

      return tx.role.findUniqueOrThrow({
        where: { id: role.id },
        include: { permissions: true },
      });
    });

    res.status(201).json({
      data: {
        ...created,
        permissions: created.permissions.map((permission) => `${permission.module}.${permission.action}`),
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/roles/:id', async (req, res, next) => {
  try {
    const payload = roleUpdateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!role) throw new AppError(404, 'Role not found');

    const updated = await prisma.$transaction(async (tx) => {
      const nextRole = await tx.role.update({
        where: { id: role.id },
        data: {
          ...(payload.name ? { name: payload.name.trim() } : {}),
          ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        },
      });

      if (payload.permissions) {
        const permissionKeys = normalizePermissionKeys(payload.permissions);
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id },
        });
        if (permissionKeys.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionKeys.map((key) => {
              const { module, action } = splitPermissionKey(key);
              return {
                companyId,
                roleId: role.id,
                module,
                action,
              };
            }),
          });
        }
      }

      return tx.role.findUniqueOrThrow({
        where: { id: nextRole.id },
        include: { permissions: true },
      });
    });

    res.json({
      data: {
        ...updated,
        permissions: updated.permissions.map((permission) => `${permission.module}.${permission.action}`),
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      companyId: req.auth!.companyId!,
      accountType: {
        in: [AccountType.COMPANY_ADMIN, AccountType.COMPANY_USER],
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      department: true,
      designation: true,
      role: true,
    },
  });

  res.json({ data: users });
});

adminRouter.post('/users', async (req, res, next) => {
  try {
    const payload = userCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const temporaryPassword = payload.temporaryPassword ?? generateTemporaryPassword();

    const user = await prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        passwordHash: await hashPassword(temporaryPassword),
        accountType: AccountType.COMPANY_USER,
        companyId,
        fullName: payload.fullName.trim(),
        employeeCode: payload.employeeCode ?? null,
        phone: payload.phone ?? null,
        departmentId: await ensureDepartment(companyId, payload.departmentId),
        designationId: await ensureDesignation(companyId, payload.designationId),
        roleId: await ensureRole(companyId, payload.roleId),
        isActive: payload.isActive ?? true,
        mustResetPassword: true,
      },
      include: {
        department: true,
        designation: true,
        role: true,
      },
    });

    res.status(201).json({
      data: {
        user,
        temporaryPassword,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const payload = userUpdateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!user) throw new AppError(404, 'User not found');
    if (user.accountType === AccountType.COMPANY_ADMIN) {
      throw new AppError(403, 'Company admin cannot be edited from this endpoint');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(payload.fullName ? { fullName: payload.fullName.trim() } : {}),
        ...(payload.email ? { email: payload.email.toLowerCase() } : {}),
        ...(payload.employeeCode !== undefined ? { employeeCode: payload.employeeCode ?? null } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone ?? null } : {}),
        ...(payload.departmentId !== undefined ? { departmentId: await ensureDepartment(companyId, payload.departmentId) } : {}),
        ...(payload.designationId !== undefined ? { designationId: await ensureDesignation(companyId, payload.designationId) } : {}),
        ...(payload.roleId !== undefined ? { roleId: await ensureRole(companyId, payload.roleId) } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
      include: {
        department: true,
        designation: true,
        role: true,
      },
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const payload = resetPasswordSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!user) throw new AppError(404, 'User not found');
    if (user.accountType !== AccountType.COMPANY_USER) {
      throw new AppError(403, 'Only company users can be reset from this endpoint');
    }

    const temporaryPassword = payload.temporaryPassword ?? generateTemporaryPassword();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustResetPassword: true,
      },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    res.json({ data: { success: true, temporaryPassword } });
  } catch (error) {
    next(error);
  }
});

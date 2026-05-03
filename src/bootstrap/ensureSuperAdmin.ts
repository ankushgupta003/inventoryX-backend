import { AccountType } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';

export async function ensureSuperAdminSeeded() {
  const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: env.SUPER_ADMIN_EMAIL },
    update: {
      fullName: env.SUPER_ADMIN_NAME,
      passwordHash,
      accountType: AccountType.SUPER_ADMIN,
      isActive: true,
      mustResetPassword: false,
      companyId: null,
      departmentId: null,
      designationId: null,
      roleId: null,
    },
    create: {
      email: env.SUPER_ADMIN_EMAIL,
      fullName: env.SUPER_ADMIN_NAME,
      passwordHash,
      accountType: AccountType.SUPER_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
  });
}

import { AccountType } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';

export async function ensureSuperAdminSeeded() {
  const existingUser = await prisma.user.findUnique({
    where: { email: env.SUPER_ADMIN_EMAIL },
    select: { id: true },
  });

  if (existingUser) {
    return;
  }

  const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: env.SUPER_ADMIN_EMAIL,
      fullName: env.SUPER_ADMIN_NAME,
      passwordHash,
      accountType: AccountType.SUPER_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
  });
}

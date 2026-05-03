import 'dotenv/config';
import { PrismaClient, AccountType } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { env } from '../src/config/env';

const prisma = new PrismaClient();

async function main() {
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

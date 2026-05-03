import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __inventoryxPrisma: PrismaClient | undefined;
}

export const prisma = global.__inventoryxPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__inventoryxPrisma = prisma;
}

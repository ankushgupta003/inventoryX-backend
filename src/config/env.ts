import path from 'path';
import dotenv from 'dotenv';

// Load local overrides first, then fall back to the standard Prisma/Node .env file.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function readEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  PORT: Number(readEnv('PORT', '5000')),
  DATABASE_URL: readEnv('DATABASE_URL'),
  JWT_ACCESS_SECRET: readEnv('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: readEnv('JWT_REFRESH_SECRET'),
  JWT_ACCESS_TTL: readEnv('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: readEnv('JWT_REFRESH_TTL', '7d'),
  SUPER_ADMIN_NAME: readEnv('SUPER_ADMIN_NAME', 'Super Admin'),
  SUPER_ADMIN_EMAIL: readEnv('SUPER_ADMIN_EMAIL'),
  SUPER_ADMIN_PASSWORD: readEnv('SUPER_ADMIN_PASSWORD'),
  FRONTEND_URL: readEnv('FRONTEND_URL', 'http://localhost:5173'),
} as const;

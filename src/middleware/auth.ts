import type { NextFunction, Request, Response } from 'express';
import { AccountType, CompanyStatus } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { normalizeTokenError, verifyAccessToken } from '../lib/tokens';
import { authUserInclude, buildAuthPayload } from '../utils/authPayload';

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing bearer token');
  }
  return header.slice(7);
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    const payload = verifyAccessToken(token);

    if (payload.type !== 'access') {
      throw new AppError(401, 'Invalid access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: authUserInclude,
    });

    if (!user) {
      throw new AppError(401, 'User not found');
    }

    if (!user.isActive) {
      throw new AppError(403, 'User account is inactive');
    }

    if (user.accountType !== AccountType.SUPER_ADMIN) {
      if (!user.company || user.company.status === CompanyStatus.SUSPENDED) {
        throw new AppError(403, 'Company is suspended');
      }
    }

    req.auth = buildAuthPayload(user);
    next();
  } catch (error) {
    next(normalizeTokenError(error, 'access'));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.accountType !== AccountType.SUPER_ADMIN) {
    return next(new AppError(403, 'Super admin access required'));
  }
  return next();
}

export function requireCompanyAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.accountType !== AccountType.COMPANY_ADMIN || !req.auth.companyId) {
    return next(new AppError(403, 'Company admin access required'));
  }
  return next();
}

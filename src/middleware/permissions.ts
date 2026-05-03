import type { NextFunction, Request, Response } from 'express';
import { AccountType } from '@prisma/client';
import { AppError } from '../errors/AppError';

export function requireCompanyMember(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || !req.auth.companyId) {
    return next(new AppError(403, 'Company access required'));
  }

  if (
    req.auth.accountType !== AccountType.COMPANY_ADMIN &&
    req.auth.accountType !== AccountType.COMPANY_USER
  ) {
    return next(new AppError(403, 'Company access required'));
  }

  return next();
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !req.auth.companyId) {
      return next(new AppError(403, 'Company access required'));
    }

    if (!req.auth.permissions.includes(permission)) {
      return next(new AppError(403, `Permission "${permission}" is required`));
    }

    return next();
  };
}

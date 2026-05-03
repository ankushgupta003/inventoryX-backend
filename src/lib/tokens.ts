import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AccountType } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { durationToMs } from './time';

type TokenKind = 'access' | 'refresh';

export interface AuthTokenPayload {
  sub: string;
  accountType: AccountType;
  companyId: string | null;
  type: TokenKind;
}

function signToken(payload: AuthTokenPayload, secret: string, expiresIn: string) {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function createAccessToken(payload: Omit<AuthTokenPayload, 'type'>) {
  return signToken({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL);
}

export function createRefreshToken(payload: Omit<AuthTokenPayload, 'type'>) {
  return signToken({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthTokenPayload;
}

export function normalizeTokenError(error: unknown, kind: TokenKind) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof jwt.TokenExpiredError) {
    return new AppError(401, `${kind === 'access' ? 'Access' : 'Refresh'} token expired`);
  }

  if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
    return new AppError(401, `Invalid ${kind} token`);
  }

  return error;
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiryDate() {
  return new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL));
}

import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('requireAuth middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a 401 AppError when the access token is expired', async () => {
    const { requireAuth } = await import('../src/middleware/auth');
    const { env } = await import('../src/config/env');

    const expiredToken = jwt.sign(
      {
        sub: 'user-1',
        accountType: 'COMPANY_ADMIN',
        companyId: 'company-1',
        type: 'access',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' },
    );

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    } as Request;

    const next = vi.fn();

    await requireAuth(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toMatchObject({
      statusCode: 401,
      message: 'Access token expired',
    });
  });
});

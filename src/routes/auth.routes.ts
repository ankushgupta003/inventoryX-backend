import { Router } from 'express';
import { AccountType, CompanyStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { comparePassword, hashPassword } from '../lib/password';
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
  verifyRefreshToken,
} from '../lib/tokens';
import { requireAuth } from '../middleware/auth';
import { authUserInclude, buildAuthPayload, buildAuthResponse } from '../utils/authPayload';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

async function issueTokens(userId: string, accountType: AccountType, companyId: string | null) {
  const accessToken = createAccessToken({ sub: userId, accountType, companyId });
  const refreshToken = createRefreshToken({ sub: userId, accountType, companyId });

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

async function authenticate(email: string, password: string, expectedAccountType?: AccountType) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: authUserInclude,
  });

  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  if (expectedAccountType && user.accountType !== expectedAccountType) {
    throw new AppError(403, 'Account is not allowed in this portal');
  }

  if (!expectedAccountType && user.accountType === AccountType.SUPER_ADMIN) {
    throw new AppError(403, 'Use the super admin login portal');
  }

  const passwordOk = await comparePassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError(403, 'User account is inactive');
  }

  if (user.accountType !== AccountType.SUPER_ADMIN) {
    if (!user.company) {
      throw new AppError(403, 'Company is not assigned');
    }
    if (user.company.status !== CompanyStatus.ACTIVE) {
      throw new AppError(403, 'Company is suspended');
    }
  }

  const tokens = await issueTokens(user.id, user.accountType, user.companyId ?? null);
  return buildAuthResponse(user, tokens.accessToken, tokens.refreshToken);
}

export const authRouter = Router();

authRouter.post('/super-admin/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const data = await authenticate(email, password, AccountType.SUPER_ADMIN);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const data = await authenticate(email, password);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ data: req.auth });
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const payload = verifyRefreshToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new AppError(401, 'Invalid refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: {
        user: {
          include: authUserInclude,
        },
      },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token is invalid or expired');
    }

    const { user } = storedToken;

    if (!user.isActive) {
      throw new AppError(403, 'User account is inactive');
    }

    if (user.accountType !== AccountType.SUPER_ADMIN) {
      if (!user.company || user.company.status !== CompanyStatus.ACTIVE) {
        throw new AppError(403, 'Company is suspended');
      }
    }

    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const tokens = await issueTokens(user.id, user.accountType, user.companyId ?? null);
    res.json({ data: buildAuthResponse(user, tokens.accessToken, tokens.refreshToken) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(parsed.data.refreshToken) },
      });
    }
    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.id },
      include: authUserInclude,
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const passwordOk = await comparePassword(currentPassword, user.passwordHash);
    if (!passwordOk) {
      throw new AppError(400, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustResetPassword: false,
      },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    const freshUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: authUserInclude,
    });

    const tokens = await issueTokens(freshUser.id, freshUser.accountType, freshUser.companyId ?? null);
    res.json({ data: buildAuthResponse(freshUser, tokens.accessToken, tokens.refreshToken) });
  } catch (error) {
    next(error);
  }
});

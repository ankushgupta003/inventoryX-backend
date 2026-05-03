import { AccountType, type CompanyStatus, Prisma, type User } from '@prisma/client';
import { ALL_PERMISSION_KEYS } from '../constants/permissions';

export const authUserInclude = {
  company: true,
  department: true,
  designation: true,
  role: {
    include: {
      permissions: true,
    },
  },
} satisfies Prisma.UserInclude;

export type AuthenticatedUserRecord = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

export interface AuthUserPayload {
  id: string;
  email: string;
  fullName: string;
  name: string;
  accountType: AccountType;
  companyId: string | null;
  companyName: string | null;
  companyStatus: CompanyStatus | null;
  mustResetPassword: boolean;
  isActive: boolean;
  permissions: string[];
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  roleId: string | null;
  roleName: string | null;
}

export function buildAuthPayload(user: AuthenticatedUserRecord): AuthUserPayload {
  const permissions =
    user.accountType === AccountType.COMPANY_ADMIN
      ? [...ALL_PERMISSION_KEYS]
      : user.accountType === AccountType.COMPANY_USER
        ? user.role?.permissions.map((permission) => `${permission.module}.${permission.action}`) ?? []
        : [];

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    name: user.fullName,
    accountType: user.accountType,
    companyId: user.companyId ?? null,
    companyName: user.company?.name ?? null,
    companyStatus: user.company?.status ?? null,
    mustResetPassword: user.mustResetPassword,
    isActive: user.isActive,
    permissions,
    departmentId: user.departmentId ?? null,
    departmentName: user.department?.name ?? null,
    designationId: user.designationId ?? null,
    designationName: user.designation?.name ?? null,
    roleId: user.roleId ?? null,
    roleName: user.role?.name ?? null,
  };
}

export function buildAuthResponse(user: AuthenticatedUserRecord, accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    user: buildAuthPayload(user),
  };
}

export function isSuperAdmin(user: Pick<User, 'accountType'>) {
  return user.accountType === AccountType.SUPER_ADMIN;
}

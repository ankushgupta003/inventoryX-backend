import type { AccountType, CompanyStatus } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
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
      };
    }
  }
}

export {};

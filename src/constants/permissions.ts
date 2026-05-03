export const PERMISSION_MODULES = [
  'dashboard',
  'items',
  'parties',
  'purchases',
  'production',
  'mrs',
  'stock_movement',
  'proforma_invoices',
  'invoices',
  'quality_requests',
  'stock_ledger',
  'reports',
  'departments',
  'designations',
  'roles',
  'users',
] as const;

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionKey = `${PermissionModule}.${PermissionAction}`;

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_MODULES.flatMap((module) =>
  PERMISSION_ACTIONS.map((action) => `${module}.${action}` as PermissionKey),
);

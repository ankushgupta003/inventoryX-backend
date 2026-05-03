import { ALL_PERMISSION_KEYS, PERMISSION_ACTIONS, PERMISSION_MODULES, type PermissionKey } from '../constants/permissions';

export const permissionCatalog = {
  modules: [...PERMISSION_MODULES],
  actions: [...PERMISSION_ACTIONS],
  keys: [...ALL_PERMISSION_KEYS],
};

export function normalizePermissionKey(input: string): PermissionKey {
  const value = input.trim().toLowerCase() as PermissionKey;
  if (!ALL_PERMISSION_KEYS.includes(value)) {
    throw new Error(`Invalid permission key: ${input}`);
  }
  return value;
}

export function normalizePermissionKeys(inputs: string[]) {
  return Array.from(new Set(inputs.map(normalizePermissionKey)));
}

export function splitPermissionKey(key: PermissionKey) {
  const [module, action] = key.split('.');
  return { module, action };
}

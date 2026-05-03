const DEFAULT_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export function generateTemporaryPassword(length = 12) {
  return Array.from({ length }, () => DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)]).join('');
}

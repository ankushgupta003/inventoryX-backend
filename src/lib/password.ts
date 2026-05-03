import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(value: string) {
  return bcrypt.hash(value, SALT_ROUNDS);
}

export function comparePassword(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

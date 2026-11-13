import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;
export const hashPassword = (password: string) => argon2.hash(password, passwordOptions);
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash.startsWith('$argon2id$')) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
let dummy: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummy;
}

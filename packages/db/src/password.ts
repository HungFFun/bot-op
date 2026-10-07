import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password);

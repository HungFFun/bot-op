import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@bot-op/db';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  API_PORT: z.coerce.number().int().default(3000),
  COOKIE_SECURE: z.stringbool().optional(),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  VAPID_PUBLIC_KEY: z.string().optional(),
});

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export type Config = {
  env: 'development' | 'production' | 'test';
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  cookieSecure: boolean;
  /** Absolute; relative values in .env are resolved from the repo root. */
  uploadDir: string;
  /** Web Push public key for browsers; null = push not configured. */
  vapidPublicKey: string | null;
};

export function loadConfig(): Config {
  loadRootEnv();
  const env = envSchema.parse(process.env);
  return {
    env: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    port: env.API_PORT,
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    uploadDir: resolve(REPO_ROOT, env.UPLOAD_DIR),
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
  };
}

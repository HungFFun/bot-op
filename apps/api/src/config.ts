import { loadRootEnv } from '@bot-op/db';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  API_PORT: z.coerce.number().int().default(3000),
  COOKIE_SECURE: z.stringbool().optional(),
});

export type Config = {
  env: 'development' | 'production' | 'test';
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  cookieSecure: boolean;
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
  };
}

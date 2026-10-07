import { loadRootEnv } from '@bot-op/db';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
});

export function loadConfig() {
  loadRootEnv();
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.DATABASE_URL,
    vapid:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        : null,
  };
}

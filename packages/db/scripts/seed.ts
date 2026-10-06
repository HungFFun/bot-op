import { phoneSchema, pinSchema } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/client';
import { loadRootEnv, requireEnv } from '../src/env';
import { hashPin } from '../src/pin';
import { branches, users } from '../src/schema';

// Idempotent: safe to run repeatedly. Existing owner keeps their current PIN.
loadRootEnv();
const { db, close } = createDb(requireEnv('DATABASE_URL'), { max: 1 });

try {
  await db
    .insert(branches)
    .values({ code: 'Q1', name: 'BamThai Quận 1' })
    .onConflictDoNothing({ target: branches.code });

  const phone = phoneSchema.parse(requireEnv('SEED_OWNER_PHONE'));
  const pin = pinSchema.parse(requireEnv('SEED_OWNER_PIN'));
  const existing = await db.query.users.findFirst({ where: eq(users.phone, phone) });

  if (existing) {
    console.log(`Owner ${phone} already exists, skipped`);
  } else {
    await db.insert(users).values({
      name: requireEnv('SEED_OWNER_NAME'),
      phone,
      role: 'owner',
      pinHash: await hashPin(pin),
    });
    console.log(`Created owner ${phone}`);
  }
} finally {
  await close();
}

import { passwordSchema, usernameSchema } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/client';
import { loadRootEnv, requireEnv } from '../src/env';
import { hashPassword } from '../src/password';
import { branches, users } from '../src/schema';

// Idempotent: safe to run repeatedly. An existing admin keeps their current password.
loadRootEnv();
const { db, close } = createDb(requireEnv('DATABASE_URL'), { max: 1 });

try {
  await db
    .insert(branches)
    .values({ code: 'Q1', name: 'BamThai Quận 1' })
    .onConflictDoNothing({ target: branches.code });

  const username = usernameSchema.parse(requireEnv('SEED_OWNER_USERNAME'));
  const password = passwordSchema.parse(requireEnv('SEED_OWNER_PASSWORD'));
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });

  if (existing) {
    console.log(`Admin ${username} already exists, skipped`);
  } else {
    await db.insert(users).values({
      username,
      name: requireEnv('SEED_OWNER_NAME'),
      role: 'owner',
      passwordHash: await hashPassword(password),
    });
    console.log(`Created admin ${username}`);
  }
} finally {
  await close();
}

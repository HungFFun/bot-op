import { USER_ROLES } from '@bot-op/shared';
import { boolean, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './common';

export const userRole = pgEnum('user_role', USER_ROLES);

export const branches = pgTable('branches', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  role: userRole('role').notNull(),
  /** null = all branches (owner, accountant). */
  branchId: uuid('branch_id').references(() => branches.id),
  pinHash: text('pin_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: tstz('locked_until'),
  /** Maps a Zalo group sender to a staff member. */
  zaloUid: text('zalo_uid'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    device: text('device'),
    expiresAt: tstz('expires_at').notNull(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: createdAt(),
});

export type Branch = typeof branches.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

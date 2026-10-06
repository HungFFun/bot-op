import { branches, hashPin, users } from '@bot-op/db';
import type { UserRole } from '@bot-op/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../src/app';

export async function buildTestApp() {
  return buildApp({
    databaseUrl: inject('databaseUrl'),
    sessionSecret: 'test-secret-test-secret',
    cookieSecure: false,
  });
}

export async function resetDb(app: FastifyInstance) {
  await app.db.execute(sql`truncate table sessions, push_subscriptions, users, branches cascade`);
}

let phoneSeq = 0;

export async function createBranch(app: FastifyInstance, code = 'Q1') {
  const [branch] = await app.db
    .insert(branches)
    .values({ code, name: `CN ${code}` })
    .returning();
  return branch!;
}

export async function createUser(
  app: FastifyInstance,
  opts: { role?: UserRole; pin?: string; branchId?: string | null; active?: boolean } = {},
) {
  const pin = opts.pin ?? '123456';
  const phone = `09${String(++phoneSeq).padStart(8, '0')}`;
  const [user] = await app.db
    .insert(users)
    .values({
      name: `User ${phoneSeq}`,
      phone,
      role: opts.role ?? 'staff',
      branchId: opts.branchId ?? null,
      pinHash: await hashPin(pin),
      active: opts.active ?? true,
    })
    .returning();
  return { ...user!, pin };
}

/** Logs in and returns the cookie header to send on later requests. */
export async function login(app: FastifyInstance, phone: string, pin: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { phone, pin } });
  const sid = res.cookies.find((c) => c.name === 'sid');
  return { res, cookie: sid ? `sid=${sid.value}` : undefined };
}

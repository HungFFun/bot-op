import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branches, hashPassword, users } from '@bot-op/db';
import type { UserRole } from '@bot-op/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../src/app';

/** Jobs the api enqueued during the current test (reset by resetDb). */
export const sentJobs: { name: string; data: any }[] = [];

export async function buildTestApp() {
  return buildApp({
    queue: {
      send: async (name, data) => {
        sentJobs.push({ name, data });
        return 'job-id';
      },
    },
    vapidPublicKey: 'test-public-key',
    databaseUrl: inject('databaseUrl'),
    sessionSecret: 'test-secret-test-secret',
    cookieSecure: false,
    uploadDir: mkdtempSync(join(tmpdir(), 'botop-uploads-')),
  });
}

export async function resetDb(app: FastifyInstance) {
  sentJobs.length = 0;
  await app.db.execute(
    sql`truncate table attachments, po_items, purchase_orders, order_batches, audit_logs, ingredient_suppliers, ingredient_prices, ingredients, ingredient_categories, suppliers, sessions, push_subscriptions, users, branches cascade`,
  );
}

let userSeq = 0;

export async function createBranch(app: FastifyInstance, code = 'Q1') {
  const [branch] = await app.db
    .insert(branches)
    .values({ code, name: `CN ${code}` })
    .returning();
  return branch!;
}

export async function createUser(
  app: FastifyInstance,
  opts: { role?: UserRole; password?: string; branchId?: string | null; active?: boolean } = {},
) {
  const password = opts.password ?? 'secret123';
  const username = `user${++userSeq}`;
  const [user] = await app.db
    .insert(users)
    .values({
      username,
      name: `User ${userSeq}`,
      role: opts.role ?? 'staff',
      branchId: opts.branchId ?? null,
      passwordHash: await hashPassword(password),
      active: opts.active ?? true,
    })
    .returning();
  return { ...user!, password };
}

/** Logs in and returns the cookie header to send on later requests. */
export async function login(app: FastifyInstance, username: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  const sid = res.cookies.find((c) => c.name === 'sid');
  return { res, cookie: sid ? `sid=${sid.value}` : undefined };
}

/** Logs in a fresh user with the given role and returns request headers. */
export async function loginAs(app: FastifyInstance, role: UserRole, branchId?: string) {
  const user = await createUser(app, { role, branchId });
  const { cookie } = await login(app, user.username, user.password);
  return { user, headers: { cookie: cookie! } };
}

/** Builds a multipart/form-data body with one file field for app.inject. */
export function multipartFile(filename: string, content: string | Buffer) {
  const boundary = '----botoptest';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

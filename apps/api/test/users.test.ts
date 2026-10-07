import { auditLogs, users } from '@bot-op/db';
import type { UserListItem } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createBranch, login, loginAs, resetDb } from './helpers';

let app: FastifyInstance;
let admin: { cookie: string };
let adminId: string;
let branchId: string;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  branchId = (await createBranch(app, 'Q1')).id;
  const a = await loginAs(app, 'owner');
  admin = a.headers;
  adminId = a.user.id;
});

const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, headers = admin) =>
  app.inject({ method, url, payload, headers });

async function createStaff(extra: object = {}) {
  const res = await req('POST', '/api/users', {
    username: 'Tuan.Bep',
    password: 'bep123456',
    name: 'Tuấn',
    role: 'staff',
    branchId,
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  return res.json<UserListItem>();
}

describe('admin issues accounts', () => {
  it('only the admin (owner) can manage accounts', async () => {
    const manager = (await loginAs(app, 'manager', branchId)).headers;
    expect((await req('GET', '/api/users', undefined, manager)).statusCode).toBe(403);
    expect((await req('POST', '/api/users', {}, manager)).statusCode).toBe(403);
  });

  it('created account can log in with the issued username (lowercased) and password', async () => {
    const created = await createStaff();
    expect(created).toMatchObject({
      username: 'tuan.bep',
      role: 'staff',
      branch: { code: 'Q1' },
      active: true,
    });

    const { res, cookie } = await login(app, 'TUAN.BEP', 'bep123456');
    expect(res.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ username: 'tuan.bep', name: 'Tuấn', role: 'staff' });
  });

  it('never returns or audits the password', async () => {
    const created = await createStaff();
    expect(JSON.stringify(created)).not.toMatch(/password|bep123456/i);
    const [log] = await app.db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(JSON.stringify(log?.diff)).not.toMatch(/password|bep123456/i);
  });

  it('rejects duplicate usernames with 409', async () => {
    await createStaff();
    const dup = await req('POST', '/api/users', {
      username: 'tuan.bep',
      password: 'x123456',
      name: 'X',
      role: 'owner',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toBe('Tên đăng nhập đã tồn tại');
  });

  it('requires a branch for staff/manager and clears it for owner/accountant', async () => {
    const noBranch = await req('POST', '/api/users', {
      username: 'a1',
      password: 'x123456',
      name: 'A',
      role: 'manager',
    });
    expect(noBranch.statusCode).toBe(400);

    const acc = await req('POST', '/api/users', {
      username: 'ketoan',
      password: 'x123456',
      name: 'KT',
      role: 'accountant',
      branchId,
    });
    expect(acc.json().branch).toBeNull();

    const staff = await createStaff();
    const promoted = await req('PATCH', `/api/users/${staff.id}`, { role: 'accountant' });
    expect(promoted.json()).toMatchObject({ role: 'accountant', branch: null });
    const demoted = await req('PATCH', `/api/users/${staff.id}`, { role: 'staff' });
    expect(demoted.statusCode).toBe(400);
  });

  it('deactivating an account signs it out immediately', async () => {
    const staff = await createStaff();
    const { cookie } = await login(app, 'tuan.bep', 'bep123456');
    await req('PATCH', `/api/users/${staff.id}`, { active: false });
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(401);
    expect((await login(app, 'tuan.bep', 'bep123456')).res.statusCode).toBe(401);
  });

  it('password reset: old password stops working, sessions end, lock is cleared', async () => {
    const staff = await createStaff();
    const { cookie } = await login(app, 'tuan.bep', 'bep123456');
    await app.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(users.id, staff.id));

    const res = await req('POST', `/api/users/${staff.id}/password`, { password: 'moi654321' });
    expect(res.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(401);
    expect((await login(app, 'tuan.bep', 'bep123456')).res.statusCode).toBe(401);
    expect((await login(app, 'tuan.bep', 'moi654321')).res.statusCode).toBe(200);
  });

  it('rejects passwords shorter than 6 characters', async () => {
    const staff = await createStaff();
    const res = await req('POST', `/api/users/${staff.id}/password`, { password: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Mật khẩu tối thiểu 6 ký tự');
  });

  it('the admin cannot deactivate or demote themselves', async () => {
    expect((await req('PATCH', `/api/users/${adminId}`, { active: false })).statusCode).toBe(400);
    expect(
      (await req('PATCH', `/api/users/${adminId}`, { role: 'manager', branchId })).statusCode,
    ).toBe(400);
  });

  it('lists accounts with lock status', async () => {
    const staff = await createStaff();
    await app.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(users.id, staff.id));
    const list = (await req('GET', '/api/users')).json<UserListItem[]>();
    expect(list.find((u) => u.id === staff.id)?.lockedUntil).not.toBeNull();
  });
});

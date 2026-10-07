import { sessions, users } from '@bot-op/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILED_ATTEMPTS } from '../src/modules/auth/routes';
import { buildTestApp, createBranch, createUser, login, resetDb } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

describe('POST /api/auth/login', () => {
  it('sets an httpOnly session cookie and /me returns the user with branch', async () => {
    const branch = await createBranch(app, 'Q1');
    const user = await createUser(app, { role: 'manager', branchId: branch.id });

    const { res, cookie } = await login(app, user.username, user.password);
    expect(res.statusCode).toBe(200);
    const sid = res.cookies.find((c) => c.name === 'sid');
    expect(sid?.httpOnly).toBe(true);
    expect(sid?.sameSite).toBe('Lax');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      id: user.id,
      username: user.username,
      name: user.name,
      role: 'manager',
      branch: { id: branch.id, code: 'Q1', name: 'CN Q1' },
    });
  });

  it('accepts the username in any letter case', async () => {
    const user = await createUser(app);
    const { res } = await login(app, user.username.toUpperCase(), user.password);
    expect(res.statusCode).toBe(200);
  });

  it('stores only a hash of the session token', async () => {
    const user = await createUser(app);
    const { cookie } = await login(app, user.username, user.password);
    const token = cookie!.slice('sid='.length);
    const [row] = await app.db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row?.tokenHash).toBeDefined();
    expect(row?.tokenHash).not.toBe(token);
  });

  it('returns the same 401 for unknown username and wrong password', async () => {
    const user = await createUser(app);
    const unknown = await login(app, 'nobody', 'secret123');
    const wrong = await login(app, user.username, 'wrong-password');
    expect(unknown.res.statusCode).toBe(401);
    expect(wrong.res.statusCode).toBe(401);
    expect(unknown.res.json()).toEqual(wrong.res.json());
    expect(wrong.res.json().message).toBe('Tên đăng nhập hoặc mật khẩu không đúng');
  });

  it('rejects invalid input with a Vietnamese message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'hung', password: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Vui lòng nhập mật khẩu');
  });

  it('rejects inactive users', async () => {
    const user = await createUser(app, { active: false });
    const { res } = await login(app, user.username, user.password);
    expect(res.statusCode).toBe(401);
  });

  it(`locks the account for 15 minutes after ${MAX_FAILED_ATTEMPTS} wrong passwords`, async () => {
    const user = await createUser(app);
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect((await login(app, user.username, 'wrong-password')).res.statusCode).toBe(401);
    }
    const fifth = await login(app, user.username, 'wrong-password');
    expect(fifth.res.statusCode).toBe(423);
    expect(fifth.res.json().message).toContain('15 phút');

    // Even the correct password is refused while locked.
    expect((await login(app, user.username, user.password)).res.statusCode).toBe(423);

    // Once the lock expires, the correct password works and counters reset.
    await app.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, user.id));
    expect((await login(app, user.username, user.password)).res.statusCode).toBe(200);
    const row = await app.db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(row?.failedAttempts).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it('resets the failure counter after a successful login', async () => {
    const user = await createUser(app);
    await login(app, user.username, 'wrong-password');
    await login(app, user.username, 'wrong-password');
    await login(app, user.username, user.password);
    const row = await app.db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(row?.failedAttempts).toBe(0);
  });
});

describe('session lifecycle', () => {
  it('/me without a cookie is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Vui lòng đăng nhập');
  });

  it('logout invalidates the session server-side', async () => {
    const user = await createUser(app);
    const { cookie } = await login(app, user.username, user.password);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const user = await createUser(app);
    const { cookie } = await login(app, user.username, user.password);
    await app.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('deactivating a user ends their existing sessions', async () => {
    const user = await createUser(app);
    const { cookie } = await login(app, user.username, user.password);
    await app.db.update(users).set({ active: false }).where(eq(users.id, user.id));
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canAccessBranch } from '../src/plugins/rbac';
import { buildTestApp, createBranch, createUser, login, resetDb } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.get('/test/owner-only', { preHandler: app.requireRole('owner') }, async () => ({ ok: true }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

describe('requireRole', () => {
  it('401 when not logged in', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/owner-only' });
    expect(res.statusCode).toBe(401);
  });

  it('403 for a role that is not allowed', async () => {
    const user = await createUser(app, { role: 'manager' });
    const { cookie } = await login(app, user.username, user.password);
    const res = await app.inject({ method: 'GET', url: '/test/owner-only', headers: { cookie } });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Bạn không có quyền thực hiện thao tác này');
  });

  it('200 for an allowed role', async () => {
    const user = await createUser(app, { role: 'owner' });
    const { cookie } = await login(app, user.username, user.password);
    const res = await app.inject({ method: 'GET', url: '/test/owner-only', headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });
});

describe('canAccessBranch', () => {
  it('scopes managers to their branch; null branch sees all', async () => {
    const q1 = await createBranch(app, 'Q1');
    const q3 = await createBranch(app, 'Q3');
    expect(canAccessBranch({ branchId: q1.id }, q1.id)).toBe(true);
    expect(canAccessBranch({ branchId: q1.id }, q3.id)).toBe(false);
    expect(canAccessBranch({ branchId: null }, q3.id)).toBe(true);
  });
});

describe('GET /api/health', () => {
  it('reports db ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });
});

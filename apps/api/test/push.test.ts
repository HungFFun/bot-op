import { pushSubscriptions } from '@bot-op/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createBranch, loginAs, resetDb, sentJobs } from './helpers';

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

const sub = (endpoint = 'https://push.example/abc') => ({
  endpoint,
  keys: { p256dh: 'p', auth: 'a' },
});

describe('push subscriptions', () => {
  it('exposes the VAPID public key to signed-in users', async () => {
    const { headers } = await loginAs(app, 'staff');
    const res = await app.inject({ method: 'GET', url: '/api/push/public-key', headers });
    expect(res.json()).toEqual({ key: 'test-public-key' });
  });

  it('upserts by endpoint (a shared phone moves to the new user) and unsubscribes', async () => {
    const a = await loginAs(app, 'manager');
    const b = await loginAs(app, 'owner');
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: a.headers,
      payload: sub(),
    });
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: b.headers,
      payload: sub(),
    });
    let rows = await app.db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.user.id);

    await app.inject({
      method: 'POST',
      url: '/api/push/unsubscribe',
      headers: b.headers,
      payload: { endpoint: sub().endpoint },
    });
    rows = await app.db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(0);
  });

  it('rejects a malformed subscription', async () => {
    const { headers } = await loginAs(app, 'staff');
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers,
      payload: { endpoint: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('new order notification', () => {
  it('sends one push per cart to branch managers and owners, not to the creator or other branches', async () => {
    const q1 = (await createBranch(app, 'Q1')).id;
    const q3 = (await createBranch(app, 'Q3')).id;
    const owner = await loginAs(app, 'owner');
    const managerQ1 = await loginAs(app, 'manager', q1);
    await loginAs(app, 'manager', q3);
    const staff = await loginAs(app, 'staff', q1);

    const supA = (
      await app.inject({
        method: 'POST',
        url: '/api/suppliers',
        headers: owner.headers,
        payload: { name: 'Đồng xanh' },
      })
    ).json().id;
    const supB = (
      await app.inject({
        method: 'POST',
        url: '/api/suppliers',
        headers: owner.headers,
        payload: { name: 'Chợ' },
      })
    ).json().id;
    const ingA = (
      await app.inject({
        method: 'POST',
        url: '/api/ingredients',
        headers: owner.headers,
        payload: { code: 'A-1', name: 'Cà rốt', unit: 'kg', defaultSupplierId: supA },
      })
    ).json().id;
    const ingB = (
      await app.inject({
        method: 'POST',
        url: '/api/ingredients',
        headers: owner.headers,
        payload: { code: 'B-1', name: 'Đá bi', unit: 'bao', defaultSupplierId: supB },
      })
    ).json().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: staff.headers,
      payload: {
        neededDate: '2026-10-07',
        items: [
          { ingredientId: ingA, qty: '1' },
          { ingredientId: ingB, qty: '2' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(sentJobs).toHaveLength(1);
    const { name, data } = sentJobs[0]!;
    expect(name).toBe('push');
    expect([...data.userIds].sort()).toEqual([owner.user.id, managerQ1.user.id].sort());
    expect(data).toMatchObject({
      title: '🛒 2 đơn mới chờ duyệt · Q1',
      url: '/po?status=submitted',
      tag: 'po-submitted',
    });
    expect(data.body).toMatch(/^User \d+: (Đồng xanh, Chợ|Chợ, Đồng xanh)$/);
  });

  it('a queue failure does not fail the order', async () => {
    const broken = await (
      await import('../src/app')
    ).buildApp({
      databaseUrl: (await import('vitest')).inject('databaseUrl'),
      sessionSecret: 'test-secret-test-secret',
      cookieSecure: false,
      uploadDir: '/tmp',
      queue: {
        send: async () => {
          throw new Error('queue down');
        },
      },
    });
    try {
      const q1 = (await createBranch(broken, 'Q1')).id;
      const owner = await loginAs(broken, 'owner');
      await loginAs(broken, 'manager', q1);
      const staff = await loginAs(broken, 'staff', q1);
      const ing = (
        await broken.inject({
          method: 'POST',
          url: '/api/ingredients',
          headers: owner.headers,
          payload: { code: 'A-1', name: 'Cà rốt', unit: 'kg' },
        })
      ).json().id;
      const res = await broken.inject({
        method: 'POST',
        url: '/api/orders',
        headers: staff.headers,
        payload: { neededDate: '2026-10-07', items: [{ ingredientId: ing, qty: '1' }] },
      });
      expect(res.statusCode).toBe(201);
    } finally {
      await broken.close();
    }
  });
});

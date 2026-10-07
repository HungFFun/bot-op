import { createDb, hashPassword, pushSubscriptions, users } from '@bot-op/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { createPushHandler, type PushTarget } from '../src/jobs/push';

const { db, close } = createDb(inject('databaseUrl'), { max: 2 });
const log = { info: () => {}, warn: () => {} };
let userA: string;
let userB: string;

beforeAll(async () => {
  await db.execute(sql`truncate table push_subscriptions, sessions, users cascade`);
  const hash = await hashPassword('x123456');
  const rows = await db
    .insert(users)
    .values([
      { username: 'wa', name: 'A', role: 'owner', passwordHash: hash },
      { username: 'wb', name: 'B', role: 'owner', passwordHash: hash },
    ])
    .returning({ id: users.id });
  [userA, userB] = [rows[0]!.id, rows[1]!.id];
});
afterAll(close);
beforeEach(async () => {
  await db.delete(pushSubscriptions);
  await db.insert(pushSubscriptions).values([
    { userId: userA, endpoint: 'https://push/a-phone', p256dh: 'p', auth: 'a' },
    { userId: userA, endpoint: 'https://push/a-laptop', p256dh: 'p', auth: 'a' },
    { userId: userB, endpoint: 'https://push/b-phone', p256dh: 'p', auth: 'a' },
  ]);
});

const job = (userIds: string[]) => [
  { id: 'j1', data: { userIds, title: 'T', body: 'B', url: '/po' } },
];

describe('push job', () => {
  it('sends to every device of the target users only, with the payload the service worker expects', async () => {
    const sent: [PushTarget, string][] = [];
    await createPushHandler({ db, log, send: async (t, p) => void sent.push([t, p]) })(
      job([userA]),
    );
    expect(sent.map(([t]) => t.endpoint).sort()).toEqual([
      'https://push/a-laptop',
      'https://push/a-phone',
    ]);
    expect(JSON.parse(sent[0]![1])).toEqual({ title: 'T', body: 'B', url: '/po' });
  });

  it('deletes subscriptions the push service reports as gone', async () => {
    const send = async (t: PushTarget) => {
      if (t.endpoint.endsWith('a-laptop'))
        throw Object.assign(new Error('gone'), { statusCode: 410 });
    };
    await createPushHandler({ db, log, send })(job([userA]));
    const left = await db.select({ e: pushSubscriptions.endpoint }).from(pushSubscriptions);
    expect(left.map((r) => r.e).sort()).toEqual(['https://push/a-phone', 'https://push/b-phone']);
  });

  it('retries only when every device failed temporarily', async () => {
    const down = async () => {
      throw Object.assign(new Error('timeout'), { statusCode: 503 });
    };
    await expect(createPushHandler({ db, log, send: down })(job([userA]))).rejects.toThrow(
      'all 2 devices',
    );

    const partial = async (t: PushTarget) => {
      if (t.endpoint.endsWith('a-laptop'))
        throw Object.assign(new Error('timeout'), { statusCode: 503 });
    };
    await expect(
      createPushHandler({ db, log, send: partial })(job([userA])),
    ).resolves.toBeUndefined();
  });
});

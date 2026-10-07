import { PgBoss } from 'pg-boss';

/** pg-boss queue names. The api only sends; the worker does the work. */
export const QUEUES = {
  push: 'push',
} as const;

/** A Web Push to some users. Recipients without a subscription are skipped. */
export type PushJob = {
  userIds: string[];
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
};

export type QueueSender = {
  send(
    name: string,
    data: object,
    options?: { retryLimit?: number; retryDelay?: number },
  ): Promise<string | null>;
};

/** Starts pg-boss (it manages its own `pgboss` schema) and makes sure our queues exist. */
export async function startQueue(url: string, onError: (err: Error) => void = console.error) {
  const boss = new PgBoss(url);
  boss.on('error', onError);
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name);
  }
  return boss;
}

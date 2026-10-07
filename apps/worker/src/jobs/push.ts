import { pushSubscriptions, type Db, type PushJob } from '@bot-op/db';
import type { PushPayload } from '@bot-op/shared';
import { inArray } from 'drizzle-orm';

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSend = (target: PushTarget, payload: string) => Promise<unknown>;
type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };

/** The browser has dropped this subscription (app removed, permission revoked). */
const isGone = (err: unknown) => {
  const code = (err as { statusCode?: number }).statusCode;
  return code === 404 || code === 410;
};

/**
 * Sends one notification to every device of the given users. Dead subscriptions are deleted. Throws
 * (so pg-boss retries) only when every device failed for a temporary reason — retrying after a partial
 * success would notify the successful devices twice.
 */
export function createPushHandler(deps: { db: Db; send: PushSend; log: Log }) {
  return async (jobs: { id: string; data: PushJob }[]) => {
    for (const job of jobs) {
      const { userIds, title, body, url, tag } = job.data;
      if (!userIds.length) continue;
      const subs = await deps.db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, userIds));
      if (!subs.length) continue;

      const payload = JSON.stringify({ title, body, url, tag } satisfies PushPayload);
      const results = await Promise.allSettled(
        subs.map((s) =>
          deps.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload),
        ),
      );

      const gone = subs.filter((_, i) => {
        const r = results[i]!;
        return r.status === 'rejected' && isGone(r.reason);
      });
      if (gone.length) {
        await deps.db.delete(pushSubscriptions).where(
          inArray(
            pushSubscriptions.id,
            gone.map((s) => s.id),
          ),
        );
      }

      const sent = results.filter((r) => r.status === 'fulfilled').length;
      const temporary = results.filter((r) => r.status === 'rejected' && !isGone(r.reason));
      const firstError =
        temporary[0]?.status === 'rejected' ? String(temporary[0].reason) : undefined;
      deps.log.info(
        { job: job.id, sent, gone: gone.length, failed: temporary.length, firstError },
        'push',
      );
      if (sent === 0 && temporary.length > 0) {
        throw new Error(`push failed on all ${temporary.length} devices`);
      }
    }
  };
}

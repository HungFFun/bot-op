import { pushSubscriptions } from '@bot-op/db';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@bot-op/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser } from '../../plugins/rbac';

export const pushRoutes: FastifyPluginAsync<{ vapidPublicKey: string | null }> = async (
  app,
  opts,
) => {
  app.get('/push/public-key', { preHandler: app.requireAuth }, async () => ({
    key: opts.vapidPublicKey,
  }));

  /** One row per browser endpoint; a phone that logs in as someone else moves to that user. */
  app.post('/push/subscribe', { preHandler: app.requireAuth }, async (req) => {
    const { endpoint, keys } = pushSubscribeSchema.parse(req.body);
    const user = currentUser(req);
    await app.db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
      });
    return { ok: true };
  });

  app.post('/push/unsubscribe', { preHandler: app.requireAuth }, async (req) => {
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    await app.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, currentUser(req).id),
        ),
      );
    return { ok: true };
  });
};

import { startQueue, type QueueSender } from '@bot-op/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    queue: QueueSender;
  }
}

/** pg-boss sender. Tests pass their own `queue` to record jobs instead. */
export default fp<{ url: string; queue?: QueueSender }>(async (app, opts) => {
  if (opts.queue) {
    app.decorate('queue', opts.queue);
    return;
  }
  const boss = await startQueue(opts.url, (err) => app.log.error(err, 'pg-boss'));
  app.decorate('queue', boss);
  app.addHook('onClose', () => boss.stop({ graceful: true }));
});

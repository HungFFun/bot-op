import { createDb, type Db } from '@bot-op/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export default fp<{ url: string }>(async (app, opts) => {
  const { db, close } = createDb(opts.url);
  app.decorate('db', db);
  app.addHook('onClose', close);
});

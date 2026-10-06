import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (req, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      req.log.error(err, 'health: db check failed');
      return reply.status(503).send({ status: 'error', db: 'error' });
    }
  });
};

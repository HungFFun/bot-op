import { branches } from '@bot-op/db';
import type { BranchRef } from '@bot-op/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

export const branchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/branches', { preHandler: app.requireAuth }, async (): Promise<BranchRef[]> =>
    app.db
      .select({ id: branches.id, code: branches.code, name: branches.name })
      .from(branches)
      .where(eq(branches.active, true))
      .orderBy(asc(branches.code)),
  );
};

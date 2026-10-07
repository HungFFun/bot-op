import { ingredientCategories } from '@bot-op/db';
import {
  CATALOG_EDITOR_ROLES,
  categoryInputSchema,
  uuidSchema,
  type Category,
} from '@bot-op/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { diffFields, writeAudit } from '../../lib/audit';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import { currentUser } from '../../plugins/rbac';

const idParams = z.object({ id: uuidSchema });
const duplicateName = () => conflict('Tên hạng mục đã tồn tại');

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  const canEdit = app.requireRole(...CATALOG_EDITOR_ROLES);

  app.get('/categories', { preHandler: app.requireAuth }, async (): Promise<Category[]> =>
    app.db
      .select({
        id: ingredientCategories.id,
        name: ingredientCategories.name,
        sortOrder: ingredientCategories.sortOrder,
      })
      .from(ingredientCategories)
      .orderBy(asc(ingredientCategories.sortOrder), asc(ingredientCategories.name)),
  );

  app.post('/categories', { preHandler: canEdit }, async (req, reply) => {
    const input = categoryInputSchema.parse(req.body);
    const user = currentUser(req);
    try {
      const created = await app.db.transaction(async (tx) => {
        const [row] = await tx.insert(ingredientCategories).values(input).returning();
        await writeAudit(tx, {
          userId: user.id,
          action: 'create',
          entity: 'ingredient_categories',
          entityId: row!.id,
          diff: input,
        });
        return row!;
      });
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
  });

  app.patch('/categories/:id', { preHandler: canEdit }, async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = categoryInputSchema.partial().parse(req.body);
    const user = currentUser(req);
    try {
      return await app.db.transaction(async (tx) => {
        const before = await tx.query.ingredientCategories.findFirst({
          where: eq(ingredientCategories.id, id),
        });
        if (!before) throw notFound('Hạng mục');
        const [row] = await tx
          .update(ingredientCategories)
          .set(patch)
          .where(eq(ingredientCategories.id, id))
          .returning();
        await writeAudit(tx, {
          userId: user.id,
          action: 'update',
          entity: 'ingredient_categories',
          entityId: id,
          diff: diffFields(before, patch),
        });
        return row!;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
  });

  /** Ingredients in a deleted category become uncategorized (FK on delete set null). */
  app.delete('/categories/:id', { preHandler: canEdit }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const user = currentUser(req);
    await app.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(ingredientCategories)
        .where(eq(ingredientCategories.id, id))
        .returning();
      if (!row) throw notFound('Hạng mục');
      await writeAudit(tx, {
        userId: user.id,
        action: 'delete',
        entity: 'ingredient_categories',
        entityId: id,
        diff: { name: row.name },
      });
    });
    return reply.status(204).send();
  });
};

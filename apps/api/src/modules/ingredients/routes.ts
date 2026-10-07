import { ingredientPrices, ingredientSuppliers, ingredients, suppliers, users } from '@bot-op/db';
import {
  CATALOG_EDITOR_ROLES,
  ingredientInputSchema,
  ingredientListQuerySchema,
  ingredientSearchText,
  manualPriceInputSchema,
  uuidSchema,
  type IngredientListItem,
  type PriceHistoryItem,
} from '@bot-op/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { diffFields, writeAudit } from '../../lib/audit';
import {
  AppError,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../lib/errors';
import { currentUser } from '../../plugins/rbac';
import { importIngredientsRoute } from './import';
import { listIngredients, setAlternateSuppliers, setIngredientImage } from './queries';

const idParams = z.object({ id: uuidSchema });

function mapWriteError(err: unknown): never {
  if (isUniqueViolation(err)) throw conflict('Mã nguyên liệu đã tồn tại');
  if (isForeignKeyViolation(err)) {
    throw new AppError(400, 'invalid_reference', 'Hạng mục hoặc nhà cung cấp không tồn tại');
  }
  throw err;
}

export const ingredientRoutes: FastifyPluginAsync = async (app) => {
  const canEdit = app.requireRole(...CATALOG_EDITOR_ROLES);

  app.get(
    '/ingredients',
    { preHandler: app.requireAuth },
    async (req): Promise<IngredientListItem[]> => {
      const { q, category, includeInactive } = ingredientListQuerySchema.parse(req.query);
      return listIngredients(app.db, { q, categoryId: category, includeInactive });
    },
  );

  app.get(
    '/ingredients/:id',
    { preHandler: app.requireAuth },
    async (req): Promise<IngredientListItem> => {
      const { id } = idParams.parse(req.params);
      const [item] = await listIngredients(app.db, { id });
      if (!item) throw notFound('Nguyên liệu');
      return item;
    },
  );

  app.post('/ingredients', { preHandler: canEdit }, async (req, reply) => {
    const { alternateSupplierIds, imageId, ...input } = ingredientInputSchema.parse(req.body);
    const user = currentUser(req);
    try {
      const id = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(ingredients)
          .values({ ...input, searchText: ingredientSearchText(input.code, input.name) })
          .returning({ id: ingredients.id });
        if (alternateSupplierIds) {
          await setAlternateSuppliers(
            tx,
            row!.id,
            alternateSupplierIds,
            input.defaultSupplierId ?? null,
          );
        }
        if (imageId) await setIngredientImage(tx, row!.id, imageId, user.id);
        await writeAudit(tx, {
          userId: user.id,
          action: 'create',
          entity: 'ingredients',
          entityId: row!.id,
          diff: { ...input, alternateSupplierIds },
        });
        return row!.id;
      });
      const [item] = await listIngredients(app.db, { id });
      return reply.status(201).send(item);
    } catch (err) {
      mapWriteError(err);
    }
  });

  /** No hard delete: ingredients are referenced by prices and POs. Deactivate with { active: false }. */
  app.patch(
    '/ingredients/:id',
    { preHandler: canEdit },
    async (req): Promise<IngredientListItem> => {
      const { id } = idParams.parse(req.params);
      const { alternateSupplierIds, imageId, ...patch } = ingredientInputSchema
        .partial()
        .parse(req.body);
      const user = currentUser(req);
      try {
        await app.db.transaction(async (tx) => {
          const before = await tx.query.ingredients.findFirst({ where: eq(ingredients.id, id) });
          if (!before) throw notFound('Nguyên liệu');
          const searchText = ingredientSearchText(
            patch.code ?? before.code,
            patch.name ?? before.name,
          );
          await tx
            .update(ingredients)
            .set({ ...patch, searchText })
            .where(eq(ingredients.id, id));
          const defaultSupplierId =
            patch.defaultSupplierId === undefined
              ? before.defaultSupplierId
              : patch.defaultSupplierId;
          if (imageId !== undefined) await setIngredientImage(tx, id, imageId, user.id);
          if (alternateSupplierIds) {
            await setAlternateSuppliers(tx, id, alternateSupplierIds, defaultSupplierId ?? null);
          } else if (defaultSupplierId) {
            // A supplier promoted to default is no longer an alternate.
            await tx
              .delete(ingredientSuppliers)
              .where(
                and(
                  eq(ingredientSuppliers.ingredientId, id),
                  eq(ingredientSuppliers.supplierId, defaultSupplierId),
                ),
              );
          }
          await writeAudit(tx, {
            userId: user.id,
            action: 'update',
            entity: 'ingredients',
            entityId: id,
            diff: {
              ...diffFields(before, patch),
              ...(alternateSupplierIds && { alternateSupplierIds }),
              ...(imageId !== undefined && { imageId }),
            },
          });
        });
      } catch (err) {
        mapWriteError(err);
      }
      const [item] = await listIngredients(app.db, { id });
      return item!;
    },
  );

  app.get(
    '/ingredients/:id/prices',
    { preHandler: app.requireAuth },
    async (req): Promise<PriceHistoryItem[]> => {
      const { id } = idParams.parse(req.params);
      const rows = await app.db
        .select({
          id: ingredientPrices.id,
          supplierId: ingredientPrices.supplierId,
          supplierName: suppliers.name,
          unitPrice: ingredientPrices.unitPrice,
          source: ingredientPrices.source,
          recordedAt: ingredientPrices.recordedAt,
          recordedById: users.id,
          recordedByName: users.name,
        })
        .from(ingredientPrices)
        .innerJoin(suppliers, eq(suppliers.id, ingredientPrices.supplierId))
        .leftJoin(users, eq(users.id, ingredientPrices.recordedBy))
        .where(eq(ingredientPrices.ingredientId, id))
        .orderBy(desc(ingredientPrices.recordedAt), desc(ingredientPrices.createdAt))
        .limit(500);
      return rows.map(({ recordedById, recordedByName, recordedAt, ...r }) => ({
        ...r,
        recordedAt: recordedAt.toISOString(),
        recordedBy:
          recordedById && recordedByName ? { id: recordedById, name: recordedByName } : null,
      }));
    },
  );

  app.post('/ingredients/:id/prices', { preHandler: canEdit }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const input = manualPriceInputSchema.parse(req.body);
    const user = currentUser(req);
    try {
      await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(ingredientPrices)
          .values({
            ingredientId: id,
            supplierId: input.supplierId,
            unitPrice: input.unitPrice,
            source: 'manual',
            recordedBy: user.id,
          })
          .returning({ id: ingredientPrices.id });
        await writeAudit(tx, {
          userId: user.id,
          action: 'price_add',
          entity: 'ingredients',
          entityId: id,
          diff: { priceId: row!.id, ...input, source: 'manual' },
        });
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) throw notFound('Nguyên liệu hoặc nhà cung cấp');
      throw err;
    }
    const [item] = await listIngredients(app.db, { id });
    return reply.status(201).send(item);
  });

  await app.register(importIngredientsRoute);
};

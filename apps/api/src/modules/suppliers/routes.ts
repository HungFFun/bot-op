import { suppliers } from '@bot-op/db';
import {
  CATALOG_EDITOR_ROLES,
  supplierInputSchema,
  uuidSchema,
  type Supplier,
} from '@bot-op/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { diffFields, writeAudit } from '../../lib/audit';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import { currentUser } from '../../plugins/rbac';

const idParams = z.object({ id: uuidSchema });
const listQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });
const duplicateName = () => conflict('Tên nhà cung cấp đã tồn tại');

export const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  phone: suppliers.phone,
  zaloContact: suppliers.zaloContact,
  address: suppliers.address,
  paymentTerms: suppliers.paymentTerms,
  note: suppliers.note,
  active: suppliers.active,
};

export const supplierRoutes: FastifyPluginAsync = async (app) => {
  const canEdit = app.requireRole(...CATALOG_EDITOR_ROLES);

  app.get('/suppliers', { preHandler: app.requireAuth }, async (req): Promise<Supplier[]> => {
    const { includeInactive } = listQuery.parse(req.query);
    return app.db
      .select(supplierColumns)
      .from(suppliers)
      .where(includeInactive === 'true' ? undefined : eq(suppliers.active, true))
      .orderBy(asc(suppliers.name));
  });

  app.post('/suppliers', { preHandler: canEdit }, async (req, reply) => {
    const input = supplierInputSchema.parse(req.body);
    const user = currentUser(req);
    try {
      const created = await app.db.transaction(async (tx) => {
        const [row] = await tx.insert(suppliers).values(input).returning(supplierColumns);
        await writeAudit(tx, {
          userId: user.id,
          action: 'create',
          entity: 'suppliers',
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

  /** No hard delete: suppliers are referenced by prices and POs. Deactivate with { active: false }. */
  app.patch('/suppliers/:id', { preHandler: canEdit }, async (req): Promise<Supplier> => {
    const { id } = idParams.parse(req.params);
    const patch = supplierInputSchema.partial().parse(req.body);
    const user = currentUser(req);
    try {
      return await app.db.transaction(async (tx) => {
        const before = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
        if (!before) throw notFound('Nhà cung cấp');
        const [row] = await tx
          .update(suppliers)
          .set(patch)
          .where(eq(suppliers.id, id))
          .returning(supplierColumns);
        await writeAudit(tx, {
          userId: user.id,
          action: 'update',
          entity: 'suppliers',
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
};

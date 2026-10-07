import {
  attachments,
  branches,
  ingredientPrices,
  ingredients,
  orderBatches,
  poItems,
  purchaseOrders,
  vLatestPriceBySupplier,
  suppliers,
  QUEUES,
  users,
  type PushJob,
} from '@bot-op/db';
import {
  BRANCH_SCOPED_ROLES,
  orderCreateSchema,
  poApproveSchema,
  poCancelSchema,
  poListQuerySchema,
  poReceiveSchema,
  poRejectSchema,
  qtyToMilli,
  supplierMessage,
  uuidSchema,
  type OrderCreateResult,
  type PoAction,
  type PoDetail,
  type PoListItem,
  type PoStatus,
} from '@bot-op/shared';
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
} from 'fastify';
import { z } from 'zod';
import { writeAudit, type Tx } from '../../lib/audit';
import { AppError, forbidden, notFound } from '../../lib/errors';
import type { AuthUser } from '../../plugins/auth';
import { currentUser } from '../../plugins/rbac';
import { allowedActions, getPurchaseOrder, listPurchaseOrders, nextPoCodes } from './queries';

const idParams = z.object({ id: uuidSchema });

const staleState = () =>
  new AppError(
    409,
    'invalid_state',
    'Đơn đã thay đổi trạng thái. Tải lại trang để xem trạng thái mới.',
  );

export const orderRoutes: FastifyPluginAsync = async (app) => {
  /** Cart → one batch + one PO per supplier (items without a supplier share one PO). */
  app.post(
    '/orders',
    { preHandler: app.requireAuth },
    async (req, reply): Promise<OrderCreateResult> => {
      const input = orderCreateSchema.parse(req.body);
      const user = currentUser(req);

      let branchId = (BRANCH_SCOPED_ROLES as readonly string[]).includes(user.role)
        ? user.branchId
        : input.branchId;
      if (!branchId) {
        // Owner/accountant have no home branch: with a single active branch there is nothing to choose.
        const active = await app.db
          .select({ id: branches.id })
          .from(branches)
          .where(eq(branches.active, true))
          .limit(2);
        if (active.length !== 1) {
          throw new AppError(400, 'branch_required', 'Vui lòng chọn chi nhánh đặt hàng');
        }
        branchId = active[0]!.id;
      }
      const branch = await app.db.query.branches.findFirst({
        where: and(eq(branches.id, branchId), eq(branches.active, true)),
      });
      if (!branch) throw new AppError(400, 'invalid_reference', 'Chi nhánh không tồn tại');

      const ids = input.items.map((i) => i.ingredientId);
      const found = await app.db
        .select({
          id: ingredients.id,
          name: ingredients.name,
          active: ingredients.active,
          supplierId: ingredients.defaultSupplierId,
        })
        .from(ingredients)
        .where(inArray(ingredients.id, ids));
      const byId = new Map(found.map((i) => [i.id, i]));
      const unavailable = ids.filter((id) => !byId.get(id)?.active);
      if (unavailable.length) {
        const names = unavailable.map((id) => byId.get(id)?.name).filter(Boolean);
        throw new AppError(
          400,
          'ingredient_unavailable',
          names.length
            ? `Nguyên liệu không còn sử dụng: ${names.join(', ')}. Xoá khỏi giỏ rồi gửi lại.`
            : 'Có nguyên liệu không còn tồn tại. Xoá khỏi giỏ rồi gửi lại.',
        );
      }

      // Estimated price = latest price from the same supplier.
      const prices = await app.db
        .select()
        .from(vLatestPriceBySupplier)
        .where(inArray(vLatestPriceBySupplier.ingredientId, ids));
      const priceOf = new Map(
        prices.map((p) => [`${p.ingredientId}:${p.supplierId}`, p.unitPrice]),
      );

      // A line may be bought from another supplier than the default (e.g. small quantity → market).
      const overrides = [
        ...new Set(input.items.map((i) => i.supplierId).filter((id): id is string => !!id)),
      ];
      if (overrides.length) {
        const found = await app.db
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(inArray(suppliers.id, overrides), eq(suppliers.active, true)));
        if (found.length !== overrides.length) {
          throw new AppError(
            400,
            'invalid_reference',
            'Nhà cung cấp không tồn tại hoặc đã ngừng hợp tác',
          );
        }
      }

      const groups = new Map<string | null, typeof input.items>();
      for (const item of input.items) {
        const supplierId = item.supplierId || byId.get(item.ingredientId)!.supplierId;
        groups.set(supplierId, [...(groups.get(supplierId) ?? []), item]);
      }

      const batchId = await app.db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(orderBatches)
          .values({
            branchId,
            createdBy: user.id,
            note: input.note ?? null,
            neededDate: input.neededDate,
          })
          .returning({ id: orderBatches.id });
        const codes = await nextPoCodes(tx, groups.size);
        let i = 0;
        for (const [supplierId, items] of groups) {
          const [po] = await tx
            .insert(purchaseOrders)
            .values({
              code: codes[i++]!,
              batchId: batch!.id,
              branchId,
              supplierId,
              neededDate: input.neededDate,
              note: input.note ?? null,
              createdBy: user.id,
            })
            .returning({ id: purchaseOrders.id, code: purchaseOrders.code });
          await tx.insert(poItems).values(
            items.map((it) => ({
              poId: po!.id,
              ingredientId: it.ingredientId,
              qtyOrdered: it.qty,
              note: it.note ?? null,
              estUnitPrice: supplierId
                ? (priceOf.get(`${it.ingredientId}:${supplierId}`) ?? null)
                : null,
            })),
          );
          await writeAudit(tx, {
            userId: user.id,
            action: 'create',
            entity: 'purchase_orders',
            entityId: po!.id,
            diff: { code: po!.code, supplierId, items },
          });
        }
        return batch!.id;
      });

      const purchaseOrdersCreated = await listPurchaseOrders(app.db, {
        batchId,
        scopeBranchId: null,
      });
      await notifyApprovers(app, req.log, user, branch, purchaseOrdersCreated);
      reply.status(201);
      return { batchId, purchaseOrders: purchaseOrdersCreated };
    },
  );

  app.get(
    '/purchase-orders',
    { preHandler: app.requireAuth },
    async (req): Promise<PoListItem[]> => {
      const { status, branch } = poListQuerySchema.parse(req.query);
      return listPurchaseOrders(app.db, {
        scopeBranchId: currentUser(req).branchId,
        status,
        branchId: branch,
      });
    },
  );

  app.get(
    '/purchase-orders/:id',
    { preHandler: app.requireAuth },
    async (req): Promise<PoDetail> => {
      const { id } = idParams.parse(req.params);
      const po = await getPurchaseOrder(app.db, id, currentUser(req));
      if (!po) throw notFound('Đơn hàng');
      return po;
    },
  );

  app.get('/purchase-orders/:id/supplier-message', { preHandler: app.requireAuth }, async (req) => {
    const { id } = idParams.parse(req.params);
    const po = await getPurchaseOrder(app.db, id, currentUser(req));
    if (!po) throw notFound('Đơn hàng');
    return {
      text: supplierMessage({
        code: po.code,
        branchName: po.branch.name,
        neededDate: po.neededDate,
        note: po.note,
        items: po.items.map((i) => ({
          name: i.name,
          qty: i.qtyOrdered,
          unit: i.unit,
          note: i.note,
        })),
      }),
    };
  });

  /**
   * Runs a status transition: checks branch access and permission, then updates only if the PO is still
   * in an expected status (guards against two people acting at once), all in one transaction with the audit entry.
   */
  async function transition(
    req: FastifyRequest,
    action: PoAction,
    from: PoStatus[],
    apply: (tx: Tx, poId: string, user: AuthUser) => Promise<Record<string, unknown> | void>,
  ): Promise<PoDetail> {
    const { id } = idParams.parse(req.params);
    const user = currentUser(req);
    await app.db.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .for('update');
      if (!po || (user.branchId && po.branchId !== user.branchId)) throw notFound('Đơn hàng');
      if (!from.includes(po.status)) throw staleState();
      if (!allowedActions(user, po).includes(action)) throw forbidden();
      const diff = await apply(tx, id, user);
      await writeAudit(tx, {
        userId: user.id,
        action,
        entity: 'purchase_orders',
        entityId: id,
        diff: { from: po.status, ...diff },
      });
    });
    return (await getPurchaseOrder(app.db, id, user))!;
  }

  app.post('/purchase-orders/:id/approve', { preHandler: app.requireAuth }, async (req) => {
    const { items } = poApproveSchema.parse(req.body ?? {});
    return transition(req, 'approve', ['submitted'], async (tx, poId, user) => {
      for (const it of items ?? []) {
        const [row] = await tx
          .update(poItems)
          .set({ qtyOrdered: it.qtyOrdered })
          .where(and(eq(poItems.id, it.id), eq(poItems.poId, poId)))
          .returning({ id: poItems.id });
        if (!row) throw new AppError(400, 'invalid_reference', 'Dòng hàng không thuộc đơn này');
      }
      await tx
        .update(purchaseOrders)
        .set({ status: 'approved', approvedBy: user.id, approvedAt: new Date() })
        .where(eq(purchaseOrders.id, poId));
      return items?.length ? { qtyChanges: items } : undefined;
    });
  });

  app.post('/purchase-orders/:id/reject', { preHandler: app.requireAuth }, async (req) => {
    const { reason } = poRejectSchema.parse(req.body);
    return transition(req, 'reject', ['submitted'], async (tx, poId, user) => {
      await tx
        .update(purchaseOrders)
        .set({
          status: 'rejected',
          rejectReason: reason,
          approvedBy: user.id,
          approvedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, poId));
      return { reason };
    });
  });

  app.post('/purchase-orders/:id/mark-ordered', { preHandler: app.requireAuth }, async (req) =>
    transition(req, 'mark_ordered', ['approved'], async (tx, poId) => {
      await tx
        .update(purchaseOrders)
        .set({ status: 'ordered', orderedAt: new Date() })
        .where(eq(purchaseOrders.id, poId));
    }),
  );

  app.post('/purchase-orders/:id/cancel', { preHandler: app.requireAuth }, async (req) => {
    const { reason } = poCancelSchema.parse(req.body ?? {});
    return transition(req, 'cancel', ['submitted', 'approved', 'ordered'], async (tx, poId) => {
      await tx
        .update(purchaseOrders)
        .set({ status: 'cancelled', rejectReason: reason ?? null })
        .where(eq(purchaseOrders.id, poId));
      return { reason };
    });
  });

  /** Records what actually arrived; received lines become the ingredient's latest price. */
  app.post('/purchase-orders/:id/receive', { preHandler: app.requireAuth }, async (req) => {
    const input = poReceiveSchema.parse(req.body);
    return transition(req, 'receive', ['approved', 'ordered'], async (tx, poId, user) => {
      const lines = await tx.select().from(poItems).where(eq(poItems.poId, poId));
      const given = new Map(input.items.map((i) => [i.id, i]));
      if (given.size !== lines.length || lines.some((l) => !given.has(l.id))) {
        throw new AppError(
          400,
          'items_mismatch',
          'Vui lòng nhập số lượng nhận cho tất cả các dòng',
        );
      }
      const [po] = await tx
        .select({ supplierId: purchaseOrders.supplierId })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId));
      const receivedAt = new Date();

      for (const line of lines) {
        const g = given.get(line.id)!;
        const received = qtyToMilli(g.qtyReceived) > 0n;
        const actualUnitPrice = received ? g.actualUnitPrice! : null;
        await tx
          .update(poItems)
          .set({ qtyReceived: g.qtyReceived, actualUnitPrice })
          .where(eq(poItems.id, line.id));
        if (received && po!.supplierId) {
          await tx.insert(ingredientPrices).values({
            ingredientId: line.ingredientId,
            supplierId: po!.supplierId,
            unitPrice: actualUnitPrice!,
            source: 'po_receipt',
            poItemId: line.id,
            recordedBy: user.id,
            recordedAt: receivedAt,
          });
        }
      }

      if (input.attachmentIds.length) {
        const linked = await tx
          .update(attachments)
          .set({ ownerType: 'po', ownerId: poId })
          .where(
            and(
              inArray(attachments.id, input.attachmentIds),
              eq(attachments.uploadedBy, user.id),
              isNull(attachments.ownerId),
            ),
          )
          .returning({ id: attachments.id });
        if (linked.length !== input.attachmentIds.length) {
          throw new AppError(
            400,
            'invalid_attachment',
            'Ảnh hoá đơn không hợp lệ, vui lòng chụp lại',
          );
        }
      }

      await tx
        .update(purchaseOrders)
        .set({ status: 'received', receivedBy: user.id, receivedAt })
        .where(eq(purchaseOrders.id, poId));
      return { items: input.items, attachmentIds: input.attachmentIds };
    });
  });
};

/**
 * One push per cart (not per PO) to the branch managers and owners. Best effort: the order is already
 * saved, so a queue problem is logged and never fails the request.
 */
async function notifyApprovers(
  app: FastifyInstance,
  log: FastifyBaseLogger,
  creator: AuthUser,
  branch: { id: string; code: string },
  pos: PoListItem[],
) {
  try {
    const approvers = await app.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.active, true),
          ne(users.id, creator.id),
          or(
            eq(users.role, 'owner'),
            and(eq(users.role, 'manager'), eq(users.branchId, branch.id)),
          ),
        ),
      );
    if (!approvers.length) return;
    const suppliersText = pos.map((p) => p.supplier?.name ?? 'Chưa có NCC').join(', ');
    const job: PushJob = {
      userIds: approvers.map((a) => a.id),
      title: `🛒 ${pos.length} đơn mới chờ duyệt · ${branch.code}`,
      body: `${creator.name}: ${suppliersText}`,
      url: pos.length === 1 ? `/po/${pos[0]!.id}` : '/po?status=submitted',
      tag: 'po-submitted',
    };
    await app.queue.send(QUEUES.push, job, { retryLimit: 3, retryDelay: 30 });
  } catch (err) {
    log.error(err, 'notify approvers failed');
  }
}

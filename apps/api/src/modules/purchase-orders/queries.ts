import {
  attachments,
  branches,
  ingredients,
  poItems,
  purchaseOrders,
  suppliers,
  users,
  type Db,
} from '@bot-op/db';
import {
  PO_APPROVER_ROLES,
  yymmdd,
  type PoAction,
  type PoDetail,
  type PoListItem,
  type PoStatus,
} from '@bot-op/shared';
import { and, asc, desc, eq, like, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '../../lib/audit';
import type { AuthUser } from '../../plugins/auth';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const person = (id: string | null, name: string | null) => (id && name ? { id, name } : null);

export type PoFilter = {
  /** Branch scope of the viewer: null = all branches. */
  scopeBranchId: string | null;
  branchId?: string;
  status?: PoStatus;
  batchId?: string;
  id?: string;
};

export async function listPurchaseOrders(db: Db | Tx, f: PoFilter): Promise<PoListItem[]> {
  const creator = alias(users, 'creator');
  const totals = db
    .select({
      poId: poItems.poId,
      itemCount: sql<number>`count(*)::int`.as('item_count'),
      // round() on numeric is half away from zero = half up for positive amounts, same as lineTotal().
      estTotal:
        sql<number>`coalesce(sum(round(${poItems.qtyOrdered} * ${poItems.estUnitPrice})), 0)::bigint`
          .mapWith(Number)
          .as('est_total'),
      itemsWithoutPrice:
        sql<number>`(count(*) filter (where ${poItems.estUnitPrice} is null))::int`.as(
          'items_without_price',
        ),
    })
    .from(poItems)
    .groupBy(poItems.poId)
    .as('totals');

  const where: SQL[] = [];
  if (f.scopeBranchId) where.push(eq(purchaseOrders.branchId, f.scopeBranchId));
  if (f.branchId) where.push(eq(purchaseOrders.branchId, f.branchId));
  if (f.status) where.push(eq(purchaseOrders.status, f.status));
  if (f.batchId) where.push(eq(purchaseOrders.batchId, f.batchId));
  if (f.id) where.push(eq(purchaseOrders.id, f.id));

  const rows = await db
    .select({
      id: purchaseOrders.id,
      code: purchaseOrders.code,
      status: purchaseOrders.status,
      neededDate: purchaseOrders.neededDate,
      note: purchaseOrders.note,
      createdAt: purchaseOrders.createdAt,
      branchId: branches.id,
      branchCode: branches.code,
      branchName: branches.name,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      creatorId: creator.id,
      creatorName: creator.name,
      itemCount: totals.itemCount,
      estTotal: totals.estTotal,
      itemsWithoutPrice: totals.itemsWithoutPrice,
    })
    .from(purchaseOrders)
    .innerJoin(branches, eq(branches.id, purchaseOrders.branchId))
    .innerJoin(creator, eq(creator.id, purchaseOrders.createdBy))
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(totals, eq(totals.poId, purchaseOrders.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(purchaseOrders.createdAt), asc(purchaseOrders.code))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    branch: { id: r.branchId, code: r.branchCode, name: r.branchName },
    supplier: person(r.supplierId, r.supplierName),
    neededDate: r.neededDate,
    note: r.note,
    itemCount: r.itemCount ?? 0,
    estTotal: r.estTotal ?? 0,
    itemsWithoutPrice: r.itemsWithoutPrice ?? 0,
    createdAt: r.createdAt.toISOString(),
    createdBy: { id: r.creatorId, name: r.creatorName },
  }));
}

const isApprover = (user: AuthUser) => (PO_APPROVER_ROLES as readonly string[]).includes(user.role);

/** Which transitions the user may perform. Branch access is checked before this is called. */
export function allowedActions(
  user: AuthUser,
  po: { status: PoStatus; createdBy: string },
): PoAction[] {
  const approver = isApprover(user);
  switch (po.status) {
    case 'submitted':
      return [
        ...(approver ? (['approve', 'reject'] as const) : []),
        ...(approver || po.createdBy === user.id ? (['cancel'] as const) : []),
      ];
    case 'approved':
      return [
        ...(approver ? (['mark_ordered'] as const) : []),
        'receive',
        ...(approver ? (['cancel'] as const) : []),
      ];
    case 'ordered':
      return ['receive', ...(approver ? (['cancel'] as const) : [])];
    default:
      return [];
  }
}

export async function getPurchaseOrder(
  db: Db | Tx,
  id: string,
  user: AuthUser,
): Promise<PoDetail | null> {
  const [base] = await listPurchaseOrders(db, { id, scopeBranchId: user.branchId });
  if (!base) return null;

  const approver = alias(users, 'approver');
  const receiver = alias(users, 'receiver');
  const [po] = await db
    .select({
      createdBy: purchaseOrders.createdBy,
      rejectReason: purchaseOrders.rejectReason,
      approvedAt: purchaseOrders.approvedAt,
      orderedAt: purchaseOrders.orderedAt,
      receivedAt: purchaseOrders.receivedAt,
      approverId: approver.id,
      approverName: approver.name,
      receiverId: receiver.id,
      receiverName: receiver.name,
    })
    .from(purchaseOrders)
    .leftJoin(approver, eq(approver.id, purchaseOrders.approvedBy))
    .leftJoin(receiver, eq(receiver.id, purchaseOrders.receivedBy))
    .where(eq(purchaseOrders.id, id));

  const items = await db
    .select({
      id: poItems.id,
      ingredientId: ingredients.id,
      code: ingredients.code,
      name: ingredients.name,
      unit: ingredients.unit,
      qtyOrdered: poItems.qtyOrdered,
      estUnitPrice: poItems.estUnitPrice,
      qtyReceived: poItems.qtyReceived,
      actualUnitPrice: poItems.actualUnitPrice,
      note: poItems.note,
    })
    .from(poItems)
    .innerJoin(ingredients, eq(ingredients.id, poItems.ingredientId))
    .where(eq(poItems.poId, id))
    .orderBy(asc(ingredients.code));

  const files = await db
    .select({ id: attachments.id, mime: attachments.mime })
    .from(attachments)
    .where(and(eq(attachments.ownerType, 'po'), eq(attachments.ownerId, id)))
    .orderBy(asc(attachments.createdAt));

  const actualTotal =
    base.status === 'received'
      ? (
          await db
            .select({
              total:
                sql<number>`coalesce(sum(round(${poItems.qtyReceived} * ${poItems.actualUnitPrice})), 0)::bigint`.mapWith(
                  Number,
                ),
            })
            .from(poItems)
            .where(eq(poItems.poId, id))
        )[0]!.total
      : null;

  return {
    ...base,
    items,
    rejectReason: po!.rejectReason,
    approvedBy: person(po!.approverId, po!.approverName),
    approvedAt: iso(po!.approvedAt),
    orderedAt: iso(po!.orderedAt),
    receivedBy: person(po!.receiverId, po!.receiverName),
    receivedAt: iso(po!.receivedAt),
    actualTotal,
    attachments: files,
    actions: allowedActions(user, { status: base.status, createdBy: po!.createdBy }),
  };
}

/** Next PO-YYMMDD-NNNN for today (Vietnam time). Serialised per day with an advisory lock held until commit. */
export async function nextPoCodes(tx: Tx, count: number, now = new Date()): Promise<string[]> {
  const prefix = `PO-${yymmdd(now)}-`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const [row] = await tx
    .select({ last: sql<string | null>`max(${purchaseOrders.code})` })
    .from(purchaseOrders)
    .where(like(purchaseOrders.code, `${prefix}%`));
  const start = row?.last ? Number(row.last.slice(prefix.length)) + 1 : 1;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(4, '0')}`);
}

export async function poItemIds(db: Db | Tx, poId: string): Promise<string[]> {
  const rows = await db.select({ id: poItems.id }).from(poItems).where(eq(poItems.poId, poId));
  return rows.map((r) => r.id);
}

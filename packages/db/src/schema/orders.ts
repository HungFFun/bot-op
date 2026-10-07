import { PO_STATUSES } from '@bot-op/shared';
import { bigint, date, index, numeric, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { ingredients, suppliers } from './catalog';
import { createdAt, id, tstz, updatedAt } from './common';
import { branches, users } from './org';

const qty = (name: string) => numeric(name, { precision: 12, scale: 3 });

/** One cart submission; split into one purchase order per supplier. */
export const orderBatches = pgTable('order_batches', {
  id: id(),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  note: text('note'),
  neededDate: date('needed_date').notNull(),
  createdAt: createdAt(),
});

export const poStatus = pgEnum('po_status', PO_STATUSES);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    /** PO-YYMMDD-NNNN, sequence per Vietnam calendar day. */
    code: text('code').notNull().unique(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => orderBatches.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    /** null = items with no supplier yet (bought ad hoc). */
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    status: poStatus('status').notNull().default('submitted'),
    neededDate: date('needed_date').notNull(),
    note: text('note'),
    rejectReason: text('reject_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: tstz('approved_at'),
    orderedAt: tstz('ordered_at'),
    receivedBy: uuid('received_by').references(() => users.id),
    receivedAt: tstz('received_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('purchase_orders_branch_status_idx').on(t.branchId, t.status),
    index('purchase_orders_created_at_idx').on(t.createdAt.desc()),
  ],
);

export const poItems = pgTable(
  'po_items',
  {
    id: id(),
    poId: uuid('po_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    qtyOrdered: qty('qty_ordered').notNull(),
    /** Snapshot of the supplier's latest price when ordered. */
    estUnitPrice: bigint('est_unit_price', { mode: 'number' }),
    qtyReceived: qty('qty_received'),
    actualUnitPrice: bigint('actual_unit_price', { mode: 'number' }),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('po_items_po_id_idx').on(t.poId)],
);

export const attachmentOwnerType = pgEnum('attachment_owner_type', [
  'expense',
  'po',
  'group_message',
  'ingredient',
]);

/** Files live on disk under UPLOAD_DIR/YYYY/MM/; only metadata is stored here. */
export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    /** null until linked to its owner (uploaded before the form is submitted). */
    ownerType: attachmentOwnerType('owner_type'),
    ownerId: uuid('owner_id'),
    /** Relative to UPLOAD_DIR. */
    filePath: text('file_path').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_owner_idx').on(t.ownerType, t.ownerId)],
);

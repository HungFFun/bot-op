import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  type AnyPgColumn,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './common';
import { attachments, poItems } from './orders';
import { users } from './org';

export const suppliers = pgTable('suppliers', {
  id: id(),
  name: text('name').notNull().unique(),
  phone: text('phone'),
  zaloContact: text('zalo_contact'),
  address: text('address'),
  paymentTerms: text('payment_terms'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ingredientCategories = pgTable('ingredient_categories', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ingredients = pgTable(
  'ingredients',
  {
    id: id(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    categoryId: uuid('category_id').references(() => ingredientCategories.id, {
      onDelete: 'set null',
    }),
    defaultSupplierId: uuid('default_supplier_id').references(() => suppliers.id),
    minOrderQty: numeric('min_order_qty', { precision: 12, scale: 3 }),
    active: boolean('active').notNull().default(true),
    note: text('note'),
    /** Photo shown in the order list (resized on the phone before upload). */
    imageId: uuid('image_id').references((): AnyPgColumn => attachments.id, {
      onDelete: 'set null',
    }),
    /** normalizeVi(code + ' ' + name), maintained by the app — enables accent-insensitive search. */
    searchText: text('search_text').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('ingredients_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('ingredients_category_id_idx').on(t.categoryId),
  ],
);

/** Other suppliers an ingredient can be bought from, besides its default supplier. */
export const ingredientSuppliers = pgTable(
  'ingredient_suppliers',
  {
    id: id(),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [unique('ingredient_suppliers_pair_unique').on(t.ingredientId, t.supplierId)],
);

export const priceSource = pgEnum('price_source', ['po_receipt', 'manual', 'import']);

export const ingredientPrices = pgTable(
  'ingredient_prices',
  {
    id: id(),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    source: priceSource('source').notNull(),
    /** Set when source = po_receipt. */
    poItemId: uuid('po_item_id').references((): AnyPgColumn => poItems.id),
    recordedBy: uuid('recorded_by').references(() => users.id),
    recordedAt: tstz('recorded_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ingredient_prices_ingredient_recorded_idx').on(t.ingredientId, t.recordedAt.desc()),
  ],
);

/** Latest price per ingredient (any supplier), plus the one before it for the ▲/▼ badge. */
export const vLatestPrice = pgView('v_latest_price', {
  ingredientId: uuid('ingredient_id').notNull(),
  supplierId: uuid('supplier_id').notNull(),
  unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  recordedAt: tstz('recorded_at').notNull(),
  prevUnitPrice: bigint('prev_unit_price', { mode: 'number' }),
}).as(sql`
  select ingredient_id, supplier_id, unit_price, recorded_at, prev_unit_price
  from (
    select ingredient_id, supplier_id, unit_price, recorded_at,
      lag(unit_price) over w as prev_unit_price,
      row_number() over (partition by ingredient_id order by recorded_at desc, created_at desc) as rn
    from ingredient_prices
    window w as (partition by ingredient_id order by recorded_at, created_at)
  ) ranked
  where rn = 1
`);

/** Latest price per (ingredient, supplier) for comparing suppliers. */
export const vLatestPriceBySupplier = pgView('v_latest_price_by_supplier', {
  ingredientId: uuid('ingredient_id').notNull(),
  supplierId: uuid('supplier_id').notNull(),
  unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  recordedAt: tstz('recorded_at').notNull(),
}).as(sql`
  select distinct on (ingredient_id, supplier_id) ingredient_id, supplier_id, unit_price, recorded_at
  from ingredient_prices
  order by ingredient_id, supplier_id, recorded_at desc, created_at desc
`);

export type Ingredient = typeof ingredients.$inferSelect;

import {
  attachments,
  ingredientCategories,
  ingredientSuppliers,
  ingredients,
  suppliers,
  vLatestPrice,
  type Db,
} from '@bot-op/db';
import { normalizeVi, type IngredientListItem } from '@bot-op/shared';
import { and, asc, eq, ilike, inArray, isNull, like, notInArray, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '../../lib/audit';
import { AppError } from '../../lib/errors';

/** numeric(12,3) comes back as "1000.000"; show "1000" / "2.5". */
const trimDecimal = (v: string) => (v.includes('.') ? v.replace(/\.?0+$/, '') : v);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type IngredientFilter = {
  q?: string;
  categoryId?: string;
  includeInactive?: boolean;
  id?: string;
};

/** Ingredients with category, default supplier and latest received price (from v_latest_price). */
export async function listIngredients(
  db: Db | Tx,
  filter: IngredientFilter,
): Promise<IngredientListItem[]> {
  const defaultSupplier = alias(suppliers, 'default_supplier');
  const priceSupplier = alias(suppliers, 'price_supplier');

  const conditions: SQL[] = [];
  if (filter.id) conditions.push(eq(ingredients.id, filter.id));
  if (!filter.includeInactive && !filter.id) conditions.push(eq(ingredients.active, true));
  if (filter.categoryId) conditions.push(eq(ingredients.categoryId, filter.categoryId));
  // Every word must appear somewhere in code+name, so "lach xa" still finds "Xà lách".
  for (const word of normalizeVi(filter.q ?? '')
    .split(' ')
    .filter(Boolean)) {
    conditions.push(ilike(ingredients.searchText, `%${escapeLike(word)}%`));
  }

  const rows = await db
    .select({
      id: ingredients.id,
      code: ingredients.code,
      name: ingredients.name,
      unit: ingredients.unit,
      active: ingredients.active,
      minOrderQty: ingredients.minOrderQty,
      note: ingredients.note,
      imageId: ingredients.imageId,
      categoryId: ingredientCategories.id,
      categoryName: ingredientCategories.name,
      defaultSupplierId: defaultSupplier.id,
      defaultSupplierName: defaultSupplier.name,
      priceSupplierId: vLatestPrice.supplierId,
      priceSupplierName: priceSupplier.name,
      unitPrice: vLatestPrice.unitPrice,
      recordedAt: vLatestPrice.recordedAt,
      prevUnitPrice: vLatestPrice.prevUnitPrice,
    })
    .from(ingredients)
    .leftJoin(ingredientCategories, eq(ingredientCategories.id, ingredients.categoryId))
    .leftJoin(defaultSupplier, eq(defaultSupplier.id, ingredients.defaultSupplierId))
    .leftJoin(vLatestPrice, eq(vLatestPrice.ingredientId, ingredients.id))
    .leftJoin(priceSupplier, eq(priceSupplier.id, vLatestPrice.supplierId))
    .where(conditions.length ? and(...conditions) : undefined)
    // Same order as the category chips; uncategorized last (Postgres sorts NULLs last on ASC).
    .orderBy(asc(ingredientCategories.sortOrder), asc(ingredients.code))
    .limit(2000);

  const alternates = await alternateSuppliersOf(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    active: r.active,
    minOrderQty: r.minOrderQty && trimDecimal(r.minOrderQty),
    note: r.note,
    category: r.categoryId && r.categoryName ? { id: r.categoryId, name: r.categoryName } : null,
    alternateSuppliers: alternates.get(r.id) ?? [],
    imageUrl: r.imageId ? `/api/attachments/${r.imageId}` : null,
    defaultSupplier:
      r.defaultSupplierId && r.defaultSupplierName
        ? { id: r.defaultSupplierId, name: r.defaultSupplierName }
        : null,
    latestPrice:
      r.unitPrice !== null && r.priceSupplierId && r.priceSupplierName && r.recordedAt
        ? {
            supplierId: r.priceSupplierId,
            supplierName: r.priceSupplierName,
            unitPrice: r.unitPrice,
            recordedAt: r.recordedAt.toISOString(),
            prevUnitPrice: r.prevUnitPrice,
          }
        : null,
  }));
}

async function alternateSuppliersOf(db: Db | Tx, ingredientIds: string[]) {
  const map = new Map<string, { id: string; name: string }[]>();
  if (!ingredientIds.length) return map;
  const rows = await db
    .select({
      ingredientId: ingredientSuppliers.ingredientId,
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(ingredientSuppliers)
    .innerJoin(suppliers, eq(suppliers.id, ingredientSuppliers.supplierId))
    .where(
      and(inArray(ingredientSuppliers.ingredientId, ingredientIds), eq(suppliers.active, true)),
    )
    .orderBy(asc(suppliers.name));
  for (const r of rows) {
    map.set(r.ingredientId, [...(map.get(r.ingredientId) ?? []), { id: r.id, name: r.name }]);
  }
  return map;
}

/** Replaces the ingredient's alternate suppliers. The default supplier is never stored as an alternate. */
export async function setAlternateSuppliers(
  tx: Tx,
  ingredientId: string,
  supplierIds: string[],
  defaultSupplierId: string | null,
) {
  const wanted = [...new Set(supplierIds)].filter((id) => id !== defaultSupplierId);
  await tx
    .delete(ingredientSuppliers)
    .where(
      wanted.length
        ? and(
            eq(ingredientSuppliers.ingredientId, ingredientId),
            notInArray(ingredientSuppliers.supplierId, wanted),
          )
        : eq(ingredientSuppliers.ingredientId, ingredientId),
    );
  await addAlternateSuppliers(tx, ingredientId, wanted, defaultSupplierId);
}

/** Adds alternates without removing existing ones (used by import). */
export async function addAlternateSuppliers(
  tx: Tx,
  ingredientId: string,
  supplierIds: string[],
  defaultSupplierId: string | null,
) {
  const ids = [...new Set(supplierIds)].filter((id) => id !== defaultSupplierId);
  if (!ids.length) return;
  await tx
    .insert(ingredientSuppliers)
    .values(ids.map((supplierId) => ({ ingredientId, supplierId })))
    .onConflictDoNothing();
}

/**
 * Sets (or clears) the ingredient photo. Only an image this user just uploaded, or the one already on
 * this ingredient, can be used.
 */
export async function setIngredientImage(
  tx: Tx,
  ingredientId: string,
  imageId: string | null,
  userId: string,
) {
  if (imageId) {
    const [linked] = await tx
      .update(attachments)
      .set({ ownerType: 'ingredient', ownerId: ingredientId })
      .where(
        and(
          eq(attachments.id, imageId),
          like(attachments.mime, 'image/%'),
          or(
            and(eq(attachments.uploadedBy, userId), isNull(attachments.ownerId)),
            and(eq(attachments.ownerType, 'ingredient'), eq(attachments.ownerId, ingredientId)),
          ),
        ),
      )
      .returning({ id: attachments.id });
    if (!linked)
      throw new AppError(400, 'invalid_attachment', 'Ảnh không hợp lệ, vui lòng chọn lại');
  }
  await tx.update(ingredients).set({ imageId }).where(eq(ingredients.id, ingredientId));
}

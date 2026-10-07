import { z } from 'zod';
import { uuidSchema, type UserRole } from './schemas';

/** Roles allowed to edit ingredients, suppliers, categories and enter prices manually. */
export const CATALOG_EDITOR_ROLES = ['manager', 'owner'] as const satisfies readonly UserRole[];

/**
 * Money in JSON is an integer number of đồng (DB column is bigint).
 * Safe-integer range is far beyond any restaurant amount.
 */
export const moneySchema = z
  .number({ error: 'Số tiền không hợp lệ' })
  .int({ error: 'Số tiền phải là số nguyên (đồng)' })
  .nonnegative({ error: 'Số tiền không được âm' })
  .max(Number.MAX_SAFE_INTEGER, { error: 'Số tiền quá lớn' });

/** Quantity as a decimal string with up to 3 decimals, matching numeric(12,3). */
export const qtySchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .pipe(
    z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, {
      error: 'Số lượng không hợp lệ (tối đa 3 chữ số thập phân)',
    }),
  );

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullish();

export const ingredientCodeSchema = z
  .string({ error: 'Vui lòng nhập mã nguyên liệu' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,29}$/, { error: 'Mã chỉ gồm chữ không dấu, số và dấu gạch ngang' });

export const ingredientInputSchema = z.object({
  code: ingredientCodeSchema,
  name: z
    .string({ error: 'Vui lòng nhập tên' })
    .trim()
    .min(1, { error: 'Vui lòng nhập tên' })
    .max(200),
  unit: z
    .string({ error: 'Vui lòng nhập đơn vị' })
    .trim()
    .min(1, { error: 'Vui lòng nhập đơn vị' })
    .max(20),
  categoryId: uuidSchema.nullish(),
  defaultSupplierId: uuidSchema.nullish(),
  /** Other suppliers this ingredient can be bought from (shown first when switching supplier on an order). */
  alternateSupplierIds: z.array(uuidSchema).max(20).optional(),
  /** Uploaded via POST /api/attachments; null removes the photo. */
  imageId: uuidSchema.nullish(),
  minOrderQty: qtySchema.nullish(),
  note: optionalText,
  active: z.boolean().optional(),
});
export type IngredientInput = z.input<typeof ingredientInputSchema>;

export const supplierInputSchema = z.object({
  name: z
    .string({ error: 'Vui lòng nhập tên NCC' })
    .trim()
    .min(1, { error: 'Vui lòng nhập tên NCC' })
    .max(200),
  phone: optionalText,
  zaloContact: optionalText,
  address: optionalText,
  paymentTerms: optionalText,
  note: optionalText,
  active: z.boolean().optional(),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

export const categoryInputSchema = z.object({
  name: z
    .string({ error: 'Vui lòng nhập tên hạng mục' })
    .trim()
    .min(1, { error: 'Vui lòng nhập tên hạng mục' })
    .max(100),
  sortOrder: z.number().int().optional(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const manualPriceInputSchema = z.object({
  supplierId: uuidSchema,
  unitPrice: moneySchema,
});
export type ManualPriceInput = z.input<typeof manualPriceInputSchema>;

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const ingredientListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: uuidSchema.optional(),
  includeInactive: boolQuery.optional(),
});

export type PriceSource = 'po_receipt' | 'manual' | 'import';

export type LatestPrice = {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  recordedAt: string;
  /** Previous recorded price for this ingredient (any supplier), for the ▲/▼ badge. */
  prevUnitPrice: number | null;
};

export type IngredientListItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  minOrderQty: string | null;
  note: string | null;
  category: { id: string; name: string } | null;
  defaultSupplier: { id: string; name: string } | null;
  alternateSuppliers: { id: string; name: string }[];
  /** /api/attachments/:id, or null when there is no photo. */
  imageUrl: string | null;
  latestPrice: LatestPrice | null;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  zaloContact: string | null;
  address: string | null;
  paymentTerms: string | null;
  note: string | null;
  active: boolean;
};

export type Category = { id: string; name: string; sortOrder: number };

export type PriceHistoryItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  source: PriceSource;
  recordedAt: string;
  recordedBy: { id: string; name: string } | null;
};

export type ImportRowError = { row: number; message: string };
export type ImportResult = {
  created: number;
  updated: number;
  pricesAdded: number;
  suppliersCreated: number;
  categoriesCreated: number;
};

/** Percent change from prev to current, rounded to an integer; null if not comparable. */
export function priceChangePct(current: number, prev: number | null | undefined): number | null {
  if (!prev) return null;
  return Math.round(((current - prev) / prev) * 100);
}

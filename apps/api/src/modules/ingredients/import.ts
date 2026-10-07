import {
  ingredientCategories,
  ingredientPrices,
  ingredients,
  suppliers,
  vLatestPriceBySupplier,
} from '@bot-op/db';
import {
  ingredientCodeSchema,
  ingredientSearchText,
  normalizeVi,
  qtySchema,
  type ImportResult,
  type ImportRowError,
} from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { writeAudit, type Tx } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { readTable, UnsupportedFileError, type Cell } from '../../lib/spreadsheet';
import { addAlternateSuppliers } from './queries';
import { currentUser } from '../../plugins/rbac';

export const MAX_IMPORT_ROWS = 5000;

const COLUMN_ALIASES = {
  code: ['ma', 'ma nl', 'ma nguyen lieu', 'code'],
  name: ['ten', 'ten nl', 'ten nguyen lieu', 'name'],
  unit: ['don vi', 'dvt', 'don vi tinh', 'unit'],
  category: ['hang muc', 'nhom', 'loai', 'category'],
  supplier: ['ncc', 'nha cung cap', 'supplier'],
  alternateSuppliers: ['ncc khac', 'nha cung cap khac', 'other suppliers'],
  price: ['gia', 'gia nhap', 'don gia', 'price'],
  minOrderQty: ['sl toi thieu', 'so luong toi thieu', 'min order', 'min_order_qty'],
  note: ['ghi chu', 'note'],
} as const;
type Column = keyof typeof COLUMN_ALIASES;

export type ImportRow = {
  row: number;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  supplier: string | null;
  /** "NCC khác": comma/semicolon separated names. */
  alternateSuppliers: string[];
  price: number | null;
  minOrderQty: string | null;
  note: string | null;
};

const text = (c: Cell | undefined) =>
  c === null || c === undefined ? null : String(c).trim() || null;

/** "35.000", "35,000đ", 35000 → 35000. Fractions of a đồng are rejected. */
export function parsePrice(c: Cell | undefined): number | null | 'invalid' {
  if (c === null || c === undefined) return null;
  if (typeof c === 'number') return Number.isSafeInteger(c) && c >= 0 ? c : 'invalid';
  const s = c.trim().toLowerCase();
  if (!/^[\d.,\s]+\s*(đ|₫|d|vnd|vnđ)?$/.test(s)) return 'invalid';
  const n = Number(s.replace(/\D/g, ''));
  return Number.isSafeInteger(n) ? n : 'invalid';
}

/** Maps header names to columns and validates every row. Row numbers are spreadsheet rows (header = 1). */
export function parseImportTable(table: Cell[][]): { rows: ImportRow[]; errors: ImportRowError[] } {
  const header = (table[0] ?? []).map((c) => normalizeVi(text(c) ?? ''));
  const col = {} as Record<Column, number | undefined>;
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [Column, readonly string[]][]) {
    const idx = header.findIndex((h) => aliases.includes(h));
    col[key] = idx >= 0 ? idx : undefined;
  }
  const missing = (['code', 'name', 'unit'] as const).filter((k) => col[k] === undefined);
  if (missing.length) {
    const names = { code: 'Mã', name: 'Tên', unit: 'Đơn vị' };
    return {
      rows: [],
      errors: [{ row: 1, message: `Thiếu cột: ${missing.map((k) => names[k]).join(', ')}` }],
    };
  }

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seenCodes = new Map<string, number>();
  const get = (r: Cell[], k: Column) => (col[k] === undefined ? undefined : r[col[k]]);

  table.slice(1).forEach((r, i) => {
    const rowNum = i + 2;
    if (r.every((c) => text(c) === null)) return;
    const fail = (message: string) => errors.push({ row: rowNum, message });

    const code = ingredientCodeSchema.safeParse(text(get(r, 'code')) ?? '');
    if (!code.success) return fail(code.error.issues[0]!.message);
    const name = text(get(r, 'name'));
    if (!name) return fail('Thiếu tên nguyên liệu');
    const unit = text(get(r, 'unit'));
    if (!unit) return fail('Thiếu đơn vị');

    const dup = seenCodes.get(code.data);
    if (dup) return fail(`Mã ${code.data} trùng với dòng ${dup}`);
    seenCodes.set(code.data, rowNum);

    const price = parsePrice(get(r, 'price'));
    if (price === 'invalid') return fail('Giá không hợp lệ (nhập số nguyên, vd 35000 hoặc 35.000)');

    let minOrderQty: string | null = null;
    const qtyCell = get(r, 'minOrderQty');
    if (text(qtyCell) !== null) {
      const qty = qtySchema.safeParse(qtyCell);
      if (!qty.success) return fail(qty.error.issues[0]!.message);
      minOrderQty = qty.data;
    }

    rows.push({
      row: rowNum,
      code: code.data,
      name: name.slice(0, 200),
      unit: unit.slice(0, 20),
      category: text(get(r, 'category')),
      supplier: text(get(r, 'supplier')),
      alternateSuppliers: (text(get(r, 'alternateSuppliers')) ?? '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      price,
      minOrderQty,
      note: text(get(r, 'note')),
    });
  });

  return { rows, errors };
}

/** Applies validated rows. Throws (rolling back the transaction) if any row cannot be applied. */
async function applyImport(tx: Tx, rows: ImportRow[], userId: string): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    pricesAdded: 0,
    suppliersCreated: 0,
    categoriesCreated: 0,
  };
  const errors: ImportRowError[] = [];

  // Names match accent/case-insensitively so "Rau Da Lat" reuses "Rau Đà Lạt".
  const supplierIds = new Map(
    (await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers)).map((s) => [
      normalizeVi(s.name),
      s.id,
    ]),
  );
  const categoryIds = new Map(
    (
      await tx
        .select({ id: ingredientCategories.id, name: ingredientCategories.name })
        .from(ingredientCategories)
    ).map((c) => [normalizeVi(c.name), c.id]),
  );
  const existing = new Map((await tx.select().from(ingredients)).map((i) => [i.code, i]));
  const latestPrice = new Map(
    (await tx.select().from(vLatestPriceBySupplier)).map((p) => [
      `${p.ingredientId}:${p.supplierId}`,
      p.unitPrice,
    ]),
  );

  const supplierId = async (name: string) => {
    const key = normalizeVi(name);
    let id = supplierIds.get(key);
    if (!id) {
      const [created] = await tx.insert(suppliers).values({ name }).returning({ id: suppliers.id });
      id = created!.id;
      supplierIds.set(key, id);
      result.suppliersCreated++;
    }
    return id;
  };
  const categoryId = async (name: string) => {
    const key = normalizeVi(name);
    let id = categoryIds.get(key);
    if (!id) {
      const [created] = await tx
        .insert(ingredientCategories)
        .values({ name })
        .returning({ id: ingredientCategories.id });
      id = created!.id;
      categoryIds.set(key, id);
      result.categoriesCreated++;
    }
    return id;
  };

  for (const row of rows) {
    const catId = row.category ? await categoryId(row.category) : undefined;
    const supId = row.supplier ? await supplierId(row.supplier) : undefined;
    const before = existing.get(row.code);

    const values = {
      name: row.name,
      unit: row.unit,
      searchText: ingredientSearchText(row.code, row.name),
      ...(catId && { categoryId: catId }),
      ...(supId && { defaultSupplierId: supId }),
      ...(row.minOrderQty && { minOrderQty: row.minOrderQty }),
      ...(row.note && { note: row.note }),
    };

    let ingredientId: string;
    let defaultSupplierId: string | null;
    if (before) {
      await tx.update(ingredients).set(values).where(eq(ingredients.id, before.id));
      ingredientId = before.id;
      defaultSupplierId = supId ?? before.defaultSupplierId;
      result.updated++;
    } else {
      const [created] = await tx
        .insert(ingredients)
        .values({ code: row.code, ...values })
        .returning({ id: ingredients.id });
      ingredientId = created!.id;
      defaultSupplierId = supId ?? null;
      result.created++;
    }

    if (row.alternateSuppliers.length) {
      const ids: string[] = [];
      for (const name of row.alternateSuppliers) ids.push(await supplierId(name));
      await addAlternateSuppliers(tx, ingredientId, ids, defaultSupplierId);
    }

    if (row.price !== null) {
      if (!defaultSupplierId) {
        errors.push({ row: row.row, message: 'Có giá nhưng chưa có nhà cung cấp' });
        continue;
      }
      // Re-importing the same file must not add duplicate price points.
      const key = `${ingredientId}:${defaultSupplierId}`;
      if (latestPrice.get(key) !== row.price) {
        await tx.insert(ingredientPrices).values({
          ingredientId,
          supplierId: defaultSupplierId,
          unitPrice: row.price,
          source: 'import',
          recordedBy: userId,
        });
        latestPrice.set(key, row.price);
        result.pricesAdded++;
      }
    }
  }

  if (errors.length) throw invalidFile(errors);
  return result;
}

const invalidFile = (rowErrors: ImportRowError[]) =>
  new AppError(
    400,
    'import_invalid',
    `File có ${rowErrors.length} dòng lỗi, chưa nhập dữ liệu nào`,
    rowErrors,
  );

export const importIngredientsRoute: FastifyPluginAsync = async (app) => {
  app.post(
    '/ingredients/import',
    { preHandler: app.requireRole('owner') },
    async (req): Promise<ImportResult> => {
      const user = currentUser(req);
      const file = await req.file();
      if (!file) throw new AppError(400, 'no_file', 'Vui lòng chọn file');

      let table: Cell[][];
      try {
        table = await readTable(await file.toBuffer(), file.filename);
      } catch (err) {
        if (err instanceof UnsupportedFileError) {
          throw new AppError(400, 'unsupported_file', 'Chỉ hỗ trợ file .xlsx hoặc .csv');
        }
        if (err instanceof AppError || (err as { statusCode?: number }).statusCode === 413)
          throw err;
        req.log.warn(err, 'import: unreadable file');
        throw new AppError(400, 'unreadable_file', 'Không đọc được file. Kiểm tra lại định dạng.');
      }

      const { rows, errors } = parseImportTable(table);
      if (errors.length) throw invalidFile(errors);
      if (!rows.length) throw new AppError(400, 'empty_file', 'File không có dòng dữ liệu nào');
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new AppError(400, 'too_many_rows', `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần nhập`);
      }

      return app.db.transaction(async (tx) => {
        const result = await applyImport(tx, rows, user.id);
        await writeAudit(tx, {
          userId: user.id,
          action: 'import',
          entity: 'ingredients',
          diff: { file: file.filename, rows: rows.length, ...result },
        });
        return result;
      });
    },
  );
};

import { ingredientPrices, ingredients, suppliers } from '@bot-op/db';
import type { IngredientListItem } from '@bot-op/shared';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseImportTable, parsePrice } from '../src/modules/ingredients/import';
import { buildTestApp, loginAs, multipartFile, resetDb } from './helpers';

let app: FastifyInstance;
let owner: { cookie: string };

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  owner = (await loginAs(app, 'owner')).headers;
});

const CSV = `Mã,Tên,Đơn vị,Hạng mục,NCC,Giá
RAU-012,Xà lách lolo,kg,Rau,Rau Đà Lạt Xanh,35.000
RAU-020,Cà chua,kg,Rau,Rau Đà Lạt Xanh,"18,000đ"
THT-003,Ba chỉ heo,kg,Thịt,Thịt Sạch Bình An,145000
KHO-001,Nước mắm,chai,Khô,,
`;

async function upload(filename: string, content: string | Buffer, headers = owner) {
  const { payload, headers: h } = multipartFile(filename, content);
  const res = await app.inject({
    method: 'POST',
    url: '/api/ingredients/import',
    payload,
    headers: { ...h, ...headers },
  });
  return { status: res.statusCode, body: res.json() };
}

describe('parsePrice', () => {
  it.each([
    [35000, 35000],
    ['35.000', 35000],
    ['35,000đ', 35000],
    ['145 000 VND', 145000],
    [null, null],
    [35000.5, 'invalid'],
    ['ba mươi', 'invalid'],
  ])('%s → %s', (input, out) => {
    expect(parsePrice(input as never)).toBe(out);
  });
});

describe('parseImportTable', () => {
  it('accepts unaccented / differently-cased headers', () => {
    const { rows, errors } = parseImportTable([
      ['MA NL', 'ten nguyen lieu', 'DVT', 'Nha cung cap', 'gia nhap'],
      ['rau-1', 'Rau', 'kg', 'NCC A', '1.000'],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ code: 'RAU-1', supplier: 'NCC A', price: 1000 });
  });

  it('reports missing required columns', () => {
    expect(parseImportTable([['Tên', 'Giá']]).errors[0]?.message).toBe('Thiếu cột: Mã, Đơn vị');
  });

  it('reports per-row errors with spreadsheet row numbers and skips blank rows', () => {
    const { errors } = parseImportTable([
      ['Mã', 'Tên', 'Đơn vị', 'Giá'],
      ['A-1', 'A', 'kg', 'abc'],
      [null, null, null, null],
      ['A-2', '', 'kg', null],
      ['a-1', 'A again', 'kg', null],
    ]);
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Giá không hợp lệ') },
      { row: 4, message: 'Thiếu tên nguyên liệu' },
      { row: 5, message: 'Mã A-1 trùng với dòng 2' },
    ]);
  });

  it('flags duplicate codes inside the file', () => {
    const { errors } = parseImportTable([
      ['Mã', 'Tên', 'Đơn vị'],
      ['A-1', 'A', 'kg'],
      ['a-1', 'B', 'kg'],
    ]);
    expect(errors).toEqual([{ row: 3, message: 'Mã A-1 trùng với dòng 2' }]);
  });
});

describe('POST /api/ingredients/import', () => {
  it('is owner-only', async () => {
    const manager = (await loginAs(app, 'manager')).headers;
    expect((await upload('a.csv', CSV, manager)).status).toBe(403);
  });

  it('imports a CSV: creates ingredients, suppliers, categories and import prices', async () => {
    const res = await upload('danh-muc.csv', CSV);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: 4,
      updated: 0,
      pricesAdded: 3,
      suppliersCreated: 2,
      categoriesCreated: 3,
    });

    const list = (
      await app.inject({ method: 'GET', url: '/api/ingredients?q=xa lach', headers: owner })
    ).json<IngredientListItem[]>();
    expect(list[0]).toMatchObject({
      code: 'RAU-012',
      category: { name: 'Rau' },
      defaultSupplier: { name: 'Rau Đà Lạt Xanh' },
      latestPrice: { unitPrice: 35000, supplierName: 'Rau Đà Lạt Xanh', prevUnitPrice: null },
    });
  });

  it('re-importing the same file adds no duplicate prices; a changed price is added', async () => {
    await upload('a.csv', CSV);
    const again = await upload('a.csv', CSV);
    expect(again.body).toMatchObject({
      created: 0,
      updated: 4,
      pricesAdded: 0,
      suppliersCreated: 0,
    });

    const changed = await upload('b.csv', CSV.replace('35.000', '36.750'));
    expect(changed.body.pricesAdded).toBe(1);
    expect(await app.db.select().from(ingredientPrices)).toHaveLength(4);
  });

  it('matches existing suppliers accent-insensitively', async () => {
    await upload('a.csv', CSV);
    await upload('b.csv', 'Mã,Tên,Đơn vị,NCC,Giá\nRAU-099,Hành lá,kg,rau da lat xanh,20000\n');
    expect(await app.db.select().from(suppliers)).toHaveLength(2);
  });

  it('imports nothing when any row is invalid', async () => {
    const bad = CSV + 'X-1,Thiếu giá hợp lệ,kg,,,12.5.x\n';
    const res = await upload('a.csv', bad);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File có 1 dòng lỗi, chưa nhập dữ liệu nào');
    expect(res.body.rowErrors).toEqual([{ row: 6, message: expect.any(String) }]);
    expect(await app.db.select().from(ingredients)).toHaveLength(0);
  });

  it('rolls back when a price has no supplier', async () => {
    const res = await upload('a.csv', 'Mã,Tên,Đơn vị,Giá\nA-1,A,kg,1000\n');
    expect(res.status).toBe(400);
    expect(res.body.rowErrors).toEqual([{ row: 2, message: 'Có giá nhưng chưa có nhà cung cấp' }]);
    expect(await app.db.select().from(ingredients)).toHaveLength(0);
  });

  it('adds alternate suppliers from the "NCC khác" column without removing existing ones', async () => {
    await upload(
      'a.csv',
      'Mã,Tên,Đơn vị,NCC,NCC khác\nPHA-008,Mật ong,chai,The Hill,"Phú Hương; Chợ"\n',
    );
    await upload('b.csv', 'Mã,Tên,Đơn vị,NCC,NCC khác\nPHA-008,Mật ong,chai,The Hill,Shopee\n');
    const [item] = (
      await app.inject({ method: 'GET', url: '/api/ingredients?q=mat ong', headers: owner })
    ).json<IngredientListItem[]>();
    expect(item!.alternateSuppliers.map((s) => s.name)).toEqual(['Chợ', 'Phú Hương', 'Shopee']);
  });

  it('reads semicolon-separated CSV with BOM (Excel VN export)', async () => {
    const res = await upload('a.csv', '﻿Mã;Tên;Đơn vị\nA-1;Muối;kg\n');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
  });

  it('imports an .xlsx file', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Danh mục');
    ws.addRow(['Mã', 'Tên', 'Đơn vị', 'NCC', 'Giá']);
    ws.addRow(['THT-003', 'Ba chỉ heo', 'kg', 'Thịt Sạch Bình An', 145000]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await upload('danh-muc.xlsx', buf);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, pricesAdded: 1 });
  });

  it('rejects other file types', async () => {
    const res = await upload('a.pdf', 'x');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Chỉ hỗ trợ file .xlsx hoặc .csv');
  });
});

import { auditLogs, ingredientPrices } from '@bot-op/db';
import type { IngredientListItem } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, resetDb } from './helpers';

let app: FastifyInstance;
let manager: { cookie: string };
let staff: { cookie: string };

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  manager = (await loginAs(app, 'manager')).headers;
  staff = (await loginAs(app, 'staff')).headers;
});

async function post<T = any>(url: string, payload: unknown, headers = manager) {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers });
  return { status: res.statusCode, body: res.json() as T };
}

async function get<T = any>(url: string, headers = staff) {
  const res = await app.inject({ method: 'GET', url, headers });
  return { status: res.statusCode, body: res.json() as T };
}

async function seedIngredient(code: string, name: string, extra: Record<string, unknown> = {}) {
  const { status, body } = await post<IngredientListItem>('/api/ingredients', {
    code,
    name,
    unit: 'kg',
    ...extra,
  });
  expect(status).toBe(201);
  return body;
}

describe('permissions', () => {
  it('staff can read but not edit the catalog', async () => {
    expect((await get('/api/ingredients')).status).toBe(200);
    expect((await post('/api/suppliers', { name: 'NCC A' }, staff)).status).toBe(403);
    expect(
      (await post('/api/ingredients', { code: 'A', name: 'A', unit: 'kg' }, staff)).status,
    ).toBe(403);
  });

  it('unauthenticated requests are rejected', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ingredients' });
    expect(res.statusCode).toBe(401);
  });
});

describe('ingredients', () => {
  it('creates with category and default supplier, and writes an audit log', async () => {
    const cat = (await post('/api/categories', { name: 'Rau' })).body;
    const sup = (await post('/api/suppliers', { name: 'Rau Đà Lạt Xanh' })).body;
    const item = await seedIngredient('rau-012', 'Xà lách lolo', {
      categoryId: cat.id,
      defaultSupplierId: sup.id,
    });

    expect(item).toMatchObject({
      code: 'RAU-012',
      name: 'Xà lách lolo',
      category: { id: cat.id, name: 'Rau' },
      defaultSupplier: { id: sup.id, name: 'Rau Đà Lạt Xanh' },
      latestPrice: null,
    });
    const logs = await app.db.select().from(auditLogs).where(eq(auditLogs.entityId, item.id));
    expect(logs.map((l) => l.action)).toEqual(['create']);
  });

  it('returns min order quantity without trailing zeros', async () => {
    expect(
      (await seedIngredient('VDU-001', 'Khăn lạnh', { minOrderQty: '1000' })).minOrderQty,
    ).toBe('1000');
    expect((await seedIngredient('VDU-002', 'Tăm', { minOrderQty: '2,5' })).minOrderQty).toBe(
      '2.5',
    );
  });

  it('rejects a duplicate code with 409', async () => {
    await seedIngredient('RAU-001', 'Xà lách');
    const dup = await post('/api/ingredients', { code: 'rau-001', name: 'Khác', unit: 'kg' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Mã nguyên liệu đã tồn tại');
  });

  it('rejects an unknown supplier id with 400', async () => {
    const res = await post('/api/ingredients', {
      code: 'X-1',
      name: 'X',
      unit: 'kg',
      defaultSupplierId: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.status).toBe(400);
  });

  it('searches without diacritics, by any word order and by code', async () => {
    await seedIngredient('RAU-012', 'Xà lách lolo');
    await seedIngredient('THT-003', 'Ba chỉ heo');
    await seedIngredient('RAU-020', 'Cà chua');

    const codes = async (q: string) =>
      (await get<IngredientListItem[]>(`/api/ingredients?q=${encodeURIComponent(q)}`)).body.map(
        (i) => i.code,
      );
    expect(await codes('xa lach')).toEqual(['RAU-012']);
    expect(await codes('LÁCH xà')).toEqual(['RAU-012']);
    expect(await codes('ba chi')).toEqual(['THT-003']);
    expect(await codes('rau')).toEqual(['RAU-012', 'RAU-020']);
    expect(await codes('100%')).toEqual([]);
  });

  it('filters by category and hides inactive unless asked', async () => {
    const cat = (await post('/api/categories', { name: 'Thịt' })).body;
    await seedIngredient('THT-003', 'Ba chỉ', { categoryId: cat.id });
    const rau = await seedIngredient('RAU-001', 'Rau muống');
    await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${rau.id}`,
      payload: { active: false },
      headers: manager,
    });

    expect(
      (await get<IngredientListItem[]>(`/api/ingredients?category=${cat.id}`)).body.map(
        (i) => i.code,
      ),
    ).toEqual(['THT-003']);
    expect((await get<IngredientListItem[]>('/api/ingredients')).body).toHaveLength(1);
    expect(
      (await get<IngredientListItem[]>('/api/ingredients?includeInactive=true')).body,
    ).toHaveLength(2);
  });

  it('PATCH updates search text when the name changes and audits the diff', async () => {
    const item = await seedIngredient('RAU-001', 'Rau muống');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${item.id}`,
      payload: { name: 'Cải thìa' },
      headers: manager,
    });
    expect(res.statusCode).toBe(200);
    expect((await get<IngredientListItem[]>('/api/ingredients?q=cai thia')).body).toHaveLength(1);
    expect((await get<IngredientListItem[]>('/api/ingredients?q=muong')).body).toHaveLength(0);

    const [log] = await app.db.select().from(auditLogs).where(eq(auditLogs.action, 'update'));
    expect(log?.diff).toEqual({ name: { from: 'Rau muống', to: 'Cải thìa' } });
  });
});

describe('alternate suppliers', () => {
  it('stores alternates, never duplicates the default, and replaces the set on PATCH', async () => {
    const a = (await post('/api/suppliers', { name: 'The Hill' })).body;
    const b = (await post('/api/suppliers', { name: 'Phú Hương' })).body;
    const c = (await post('/api/suppliers', { name: 'Chợ' })).body;
    const item = await seedIngredient('PHA-008', 'Mật ong', {
      defaultSupplierId: a.id,
      alternateSupplierIds: [a.id, b.id],
    });
    expect(item.alternateSuppliers.map((s) => s.name)).toEqual(['Phú Hương']);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${item.id}`,
      payload: { alternateSupplierIds: [c.id] },
      headers: manager,
    });
    expect(patched.json<IngredientListItem>().alternateSuppliers.map((s) => s.name)).toEqual([
      'Chợ',
    ]);
  });

  it('promoting an alternate to default removes it from the alternates', async () => {
    const a = (await post('/api/suppliers', { name: 'Đồng xanh' })).body;
    const c = (await post('/api/suppliers', { name: 'Chợ' })).body;
    const item = await seedIngredient('RAU-020', 'Húng quế', {
      defaultSupplierId: a.id,
      alternateSupplierIds: [c.id],
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${item.id}`,
      payload: { defaultSupplierId: c.id },
      headers: manager,
    });
    expect(res.json<IngredientListItem>()).toMatchObject({
      defaultSupplier: { name: 'Chợ' },
      alternateSuppliers: [],
    });
  });
});

const upload = (headers: { cookie: string }, type = 'image/jpeg') =>
  app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: { ...headers, 'content-type': 'multipart/form-data; boundary=x' },
    payload: Buffer.concat([
      Buffer.from(
        `--x\r\nContent-Disposition: form-data; name="file"; filename="a"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('\r\n--x--\r\n'),
    ]),
  });

describe('ingredient photo', () => {
  it('links an uploaded photo; everyone signed in can see it; null removes it', async () => {
    const item = await seedIngredient('RAU-001', 'Cà rốt');
    const imageId = (await upload(manager)).json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${item.id}`,
      payload: { imageId },
      headers: manager,
    });
    expect(res.json<IngredientListItem>().imageUrl).toBe(`/api/attachments/${imageId}`);

    const asStaff = await app.inject({
      method: 'GET',
      url: `/api/attachments/${imageId}`,
      headers: staff,
    });
    expect(asStaff.statusCode).toBe(200);
    expect(asStaff.headers['cache-control']).toContain('immutable');

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${item.id}`,
      payload: { imageId: null },
      headers: manager,
    });
    expect(cleared.json<IngredientListItem>().imageUrl).toBeNull();
  });

  it('cannot use a file uploaded by someone else, or a PDF', async () => {
    const item = await seedIngredient('RAU-001', 'Cà rốt');
    const staffUpload = (await upload(staff)).json().id;
    const pdf = (await upload(manager, 'application/pdf')).json().id;
    for (const imageId of [staffUpload, pdf]) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/ingredients/${item.id}`,
        payload: { imageId },
        headers: manager,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('prices', () => {
  it('latest price follows the newest record and keeps the previous one for the badge', async () => {
    const a = (await post('/api/suppliers', { name: 'NCC A' })).body;
    const b = (await post('/api/suppliers', { name: 'NCC B' })).body;
    const item = await seedIngredient('RAU-012', 'Xà lách', { defaultSupplierId: a.id });

    await post(`/api/ingredients/${item.id}/prices`, { supplierId: a.id, unitPrice: 35000 });
    const after = (
      await post<IngredientListItem>(`/api/ingredients/${item.id}/prices`, {
        supplierId: b.id,
        unitPrice: 38500,
      })
    ).body;

    expect(after.latestPrice).toMatchObject({
      supplierName: 'NCC B',
      unitPrice: 38500,
      prevUnitPrice: 35000,
    });

    const history = (await get(`/api/ingredients/${item.id}/prices`)).body;
    expect(history.map((h: { unitPrice: number }) => h.unitPrice)).toEqual([38500, 35000]);
    expect(history[0]).toMatchObject({
      source: 'manual',
      recordedBy: { name: expect.any(String) },
    });
  });

  it('rejects non-integer and negative prices', async () => {
    const a = (await post('/api/suppliers', { name: 'NCC A' })).body;
    const item = await seedIngredient('RAU-012', 'Xà lách');
    expect(
      (await post(`/api/ingredients/${item.id}/prices`, { supplierId: a.id, unitPrice: 1.5 }))
        .status,
    ).toBe(400);
    expect(
      (await post(`/api/ingredients/${item.id}/prices`, { supplierId: a.id, unitPrice: -1 }))
        .status,
    ).toBe(400);
    expect(await app.db.select().from(ingredientPrices)).toHaveLength(0);
  });
});

describe('suppliers and categories', () => {
  it('rejects duplicate names with 409 and hides inactive suppliers by default', async () => {
    const a = (await post('/api/suppliers', { name: 'NCC A', phone: '' })).body;
    expect(a.phone).toBeNull();
    expect((await post('/api/suppliers', { name: 'NCC A' })).status).toBe(409);
    expect((await post('/api/categories', { name: 'Rau' })).status).toBe(201);
    expect((await post('/api/categories', { name: 'Rau' })).status).toBe(409);

    await app.inject({
      method: 'PATCH',
      url: `/api/suppliers/${a.id}`,
      payload: { active: false },
      headers: manager,
    });
    expect((await get('/api/suppliers')).body).toHaveLength(0);
    expect((await get('/api/suppliers?includeInactive=true')).body).toHaveLength(1);
  });

  it('deleting a category leaves its ingredients uncategorized', async () => {
    const cat = (await post('/api/categories', { name: 'Rau' })).body;
    const item = await seedIngredient('RAU-001', 'Rau muống', { categoryId: cat.id });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${cat.id}`,
      headers: manager,
    });
    expect(del.statusCode).toBe(204);
    expect((await get(`/api/ingredients/${item.id}`)).body.category).toBeNull();
  });
});

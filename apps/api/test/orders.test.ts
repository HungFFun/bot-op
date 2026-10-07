import { auditLogs, branches, ingredientPrices } from '@bot-op/db';
import type { IngredientListItem, OrderCreateResult, PoDetail, PoListItem } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createBranch, loginAs, resetDb } from './helpers';

let app: FastifyInstance;
type H = { cookie: string };
let q1: string;
let q3: string;
let owner: H;
let managerQ1: H;
let managerQ3: H;
let staffQ1: H;
let ing: Record<string, IngredientListItem>;
let sup: Record<string, string>;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});

const call = async <T = any>(method: 'GET' | 'POST', url: string, headers: H, payload?: object) => {
  const res = await app.inject({ method, url, headers, payload });
  return { status: res.statusCode, body: res.json() as T };
};

beforeEach(async () => {
  await resetDb(app);
  q1 = (await createBranch(app, 'Q1')).id;
  q3 = (await createBranch(app, 'Q3')).id;
  owner = (await loginAs(app, 'owner')).headers;
  managerQ1 = (await loginAs(app, 'manager', q1)).headers;
  managerQ3 = (await loginAs(app, 'manager', q3)).headers;
  staffQ1 = (await loginAs(app, 'staff', q1)).headers;

  sup = {};
  for (const name of ['Đồng xanh', 'HS71'])
    sup[name] = (await call('POST', '/api/suppliers', owner, { name })).body.id;
  ing = {};
  const mk = async (code: string, name: string, unit: string, supplier?: string) =>
    (ing[code] = (
      await call('POST', '/api/ingredients', owner, {
        code,
        name,
        unit,
        defaultSupplierId: supplier ? sup[supplier] : null,
      })
    ).body);
  await mk('RAU-001', 'Cà rốt', 'kg', 'Đồng xanh');
  await mk('RAU-002', 'Hành tím', 'kg', 'Đồng xanh');
  await mk('HSA-001', 'Tôm thẻ', 'kg', 'HS71');
  await mk('KHA-001', 'Đá bi', 'bao');
  await call('POST', `/api/ingredients/${ing['RAU-001']!.id}/prices`, owner, {
    supplierId: sup['Đồng xanh'],
    unitPrice: 20000,
  });
  await call('POST', `/api/ingredients/${ing['HSA-001']!.id}/prices`, owner, {
    supplierId: sup['HS71'],
    unitPrice: 180000,
  });
});

async function placeOrder(headers = staffQ1, extra: object = {}) {
  const res = await call<OrderCreateResult>('POST', '/api/orders', headers, {
    neededDate: '2026-10-07',
    note: 'giao trước 9h',
    items: [
      { ingredientId: ing['RAU-001']!.id, qty: '3' },
      { ingredientId: ing['RAU-002']!.id, qty: '2,5' },
      { ingredientId: ing['HSA-001']!.id, qty: '1.5' },
      { ingredientId: ing['KHA-001']!.id, qty: '4' },
    ],
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}

/** Multipart upload with an explicit part content type. */
const uploadFile = (headers: H, filename: string, type: string) =>
  app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: { ...headers, 'content-type': 'multipart/form-data; boundary=x' },
    payload: Buffer.concat([
      Buffer.from(
        `--x\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('\r\n--x--\r\n'),
    ]),
  });

const po = (r: OrderCreateResult, supplier: string | null) =>
  r.purchaseOrders.find((p) => (p.supplier?.name ?? null) === supplier)!;

describe('POST /api/orders', () => {
  it('splits one cart into one PO per supplier, with codes PO-YYMMDD-NNNN', async () => {
    const r = await placeOrder();
    expect(r.purchaseOrders).toHaveLength(3);
    const codes = r.purchaseOrders.map((p) => p.code).sort();
    expect(codes[0]).toMatch(/^PO-\d{6}-0001$/);
    expect(codes[2]).toMatch(/^PO-\d{6}-0003$/);
    expect(po(r, 'Đồng xanh')).toMatchObject({
      status: 'submitted',
      itemCount: 2,
      branch: { code: 'Q1' },
      note: 'giao trước 9h',
      neededDate: '2026-10-07',
    });
    expect(po(r, null).itemCount).toBe(1);
  });

  it('snapshots the supplier latest price as estimate; lines without a price are counted separately', async () => {
    const r = await placeOrder();
    // 3 × 20.000 (Cà rốt) + Hành tím has no price
    expect(po(r, 'Đồng xanh')).toMatchObject({ estTotal: 60000, itemsWithoutPrice: 1 });
    expect(po(r, 'HS71')).toMatchObject({ estTotal: 270000, itemsWithoutPrice: 0 });
  });

  it('continues the daily sequence across orders', async () => {
    await placeOrder();
    const second = await placeOrder();
    expect(second.purchaseOrders.map((p) => p.code.slice(-4)).sort()).toEqual([
      '0004',
      '0005',
      '0006',
    ]);
  });

  it('staff orders for their own branch even if another branch is sent', async () => {
    const r = await placeOrder(staffQ1, { branchId: q3 });
    expect(r.purchaseOrders[0]!.branch.code).toBe('Q1');
  });

  it('owner must pick a branch when there are several', async () => {
    const res = await call('POST', '/api/orders', owner, {
      neededDate: '2026-10-07',
      items: [{ ingredientId: ing['RAU-001']!.id, qty: '1' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Vui lòng chọn chi nhánh đặt hàng');
    const ok = await placeOrder(owner, { branchId: q3 });
    expect(ok.purchaseOrders[0]!.branch.code).toBe('Q3');
  });

  it('owner order goes to the only active branch without choosing', async () => {
    await app.db.update(branches).set({ active: false }).where(eq(branches.id, q3));
    const ok = await placeOrder(owner);
    expect(ok.purchaseOrders[0]!.branch.code).toBe('Q1');
  });

  it('rejects inactive ingredients by name', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/ingredients/${ing['RAU-002']!.id}`,
      headers: owner,
      payload: { active: false },
    });
    const res = await call('POST', '/api/orders', staffQ1, {
      neededDate: '2026-10-07',
      items: [{ ingredientId: ing['RAU-002']!.id, qty: '1' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Hành tím');
  });
});

describe('per-line supplier and note', () => {
  it('a line bought at the market goes to that supplier PO, with its own note in the message', async () => {
    const market = (await call('POST', '/api/suppliers', owner, { name: 'Chợ' })).body.id;
    const res = await call<OrderCreateResult>('POST', '/api/orders', staffQ1, {
      neededDate: '2026-10-07',
      items: [
        { ingredientId: ing['RAU-001']!.id, qty: '3' },
        { ingredientId: ing['RAU-002']!.id, qty: '0.5', supplierId: market, note: 'lấy củ nhỏ' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.purchaseOrders.map((p) => p.supplier?.name).sort()).toEqual([
      'Chợ',
      'Đồng xanh',
    ]);

    const marketPo = res.body.purchaseOrders.find((p) => p.supplier?.name === 'Chợ')!;
    const detail = (await call<PoDetail>('GET', `/api/purchase-orders/${marketPo.id}`, staffQ1))
      .body;
    expect(detail.items).toMatchObject([
      { code: 'RAU-002', note: 'lấy củ nhỏ', estUnitPrice: null },
    ]);
    const msg = (
      await call<{ text: string }>(
        'GET',
        `/api/purchase-orders/${marketPo.id}/supplier-message`,
        staffQ1,
      )
    ).body.text;
    expect(msg).toContain('- Hành tím: 0,5 kg (lấy củ nhỏ)');
  });

  it('rejects an unknown or inactive supplier override', async () => {
    const res = await call('POST', '/api/orders', staffQ1, {
      neededDate: '2026-10-07',
      items: [
        {
          ingredientId: ing['RAU-001']!.id,
          qty: '1',
          supplierId: '00000000-0000-4000-8000-000000000000',
        },
      ],
    });
    expect(res.status).toBe(400);
  });
});

describe('PO visibility', () => {
  it('managers see only their branch; owner sees all', async () => {
    await placeOrder();
    expect((await call<PoListItem[]>('GET', '/api/purchase-orders', managerQ3)).body).toHaveLength(
      0,
    );
    expect((await call<PoListItem[]>('GET', '/api/purchase-orders', managerQ1)).body).toHaveLength(
      3,
    );
    expect(
      (await call<PoListItem[]>('GET', '/api/purchase-orders?status=submitted', owner)).body,
    ).toHaveLength(3);
    expect(
      (await call<PoListItem[]>('GET', '/api/purchase-orders?status=approved', owner)).body,
    ).toHaveLength(0);
  });

  it('another branch cannot open or act on the PO (404, not 403)', async () => {
    const id = po(await placeOrder(), 'HS71').id;
    expect((await call('GET', `/api/purchase-orders/${id}`, managerQ3)).status).toBe(404);
    expect((await call('POST', `/api/purchase-orders/${id}/approve`, managerQ3, {})).status).toBe(
      404,
    );
  });
});

describe('attachments', () => {
  it('accepts images and PDF only; an unlinked file is visible only to its uploader', async () => {
    expect((await uploadFile(staffQ1, 'x.exe', 'application/octet-stream')).statusCode).toBe(400);
    const id = (await uploadFile(staffQ1, 'hd.jpg', 'image/jpeg')).json().id;
    expect(
      (await app.inject({ method: 'GET', url: `/api/attachments/${id}`, headers: staffQ1 }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `/api/attachments/${id}`, headers: managerQ1 }))
        .statusCode,
    ).toBe(404);
  });
});

describe('PO lifecycle', () => {
  it('staff cannot approve; manager approves with quantity edits; actions follow the status', async () => {
    const id = po(await placeOrder(), 'Đồng xanh').id;
    const asStaff = await call<PoDetail>('GET', `/api/purchase-orders/${id}`, staffQ1);
    expect(asStaff.body.actions).toEqual(['cancel']); // creator may cancel while submitted
    expect((await call('POST', `/api/purchase-orders/${id}/approve`, staffQ1, {})).status).toBe(
      403,
    );

    const detail = (await call<PoDetail>('GET', `/api/purchase-orders/${id}`, managerQ1)).body;
    expect(detail.actions).toEqual(['approve', 'reject', 'cancel']);
    const carrot = detail.items.find((i) => i.code === 'RAU-001')!;
    const approved = await call<PoDetail>('POST', `/api/purchase-orders/${id}/approve`, managerQ1, {
      items: [{ id: carrot.id, qtyOrdered: '5' }],
    });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'approved',
      approvedBy: { name: expect.any(String) },
      estTotal: 100000,
    });
    expect(approved.body.actions).toEqual(['mark_ordered', 'receive', 'cancel']);

    // Approving twice is a stale-state conflict.
    expect((await call('POST', `/api/purchase-orders/${id}/approve`, managerQ1, {})).status).toBe(
      409,
    );
  });

  it('reject requires a reason and records it', async () => {
    const id = po(await placeOrder(), 'HS71').id;
    expect(
      (await call('POST', `/api/purchase-orders/${id}/reject`, managerQ1, { reason: ' ' })).status,
    ).toBe(400);
    const r = await call<PoDetail>('POST', `/api/purchase-orders/${id}/reject`, managerQ1, {
      reason: 'Đã đặt hôm qua',
    });
    expect(r.body).toMatchObject({
      status: 'rejected',
      rejectReason: 'Đã đặt hôm qua',
      actions: [],
    });
  });

  it('supplier message follows the template', async () => {
    const id = po(await placeOrder(), 'Đồng xanh').id;
    const msg = (
      await call<{ text: string }>('GET', `/api/purchase-orders/${id}/supplier-message`, staffQ1)
    ).body.text;
    expect(msg).toMatch(
      /^CN Q1 đặt hàng ngày 07\/10 \(giao trước 9h\):\n- Cà rốt: 3 kg\n- Hành tím: 2,5 kg\nMã đơn: PO-\d{6}-\d{4}\. Cảm ơn anh\/chị!$/,
    );
  });

  it('receiving records actual quantities, sets latest prices and links the invoice photo', async () => {
    const id = po(await placeOrder(), 'Đồng xanh').id;
    await call('POST', `/api/purchase-orders/${id}/approve`, managerQ1, {});
    await call('POST', `/api/purchase-orders/${id}/mark-ordered`, managerQ1, {});

    const upload = await uploadFile(staffQ1, 'hd.jpg', 'image/jpeg');
    expect(upload.statusCode).toBe(201);
    const attachmentId = upload.json().id;

    const detail = (await call<PoDetail>('GET', `/api/purchase-orders/${id}`, staffQ1)).body;
    expect(detail.actions).toEqual(['receive']);
    const carrot = detail.items.find((i) => i.code === 'RAU-001')!;
    const onion = detail.items.find((i) => i.code === 'RAU-002')!;

    // Missing price on a received line is rejected.
    const bad = await call('POST', `/api/purchase-orders/${id}/receive`, staffQ1, {
      items: [
        { id: carrot.id, qtyReceived: '3' },
        { id: onion.id, qtyReceived: '0' },
      ],
    });
    expect(bad.status).toBe(400);

    const res = await call<PoDetail>('POST', `/api/purchase-orders/${id}/receive`, staffQ1, {
      items: [
        { id: carrot.id, qtyReceived: '2.8', actualUnitPrice: 22000 },
        { id: onion.id, qtyReceived: '0' },
      ],
      attachmentIds: [attachmentId],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'received',
      actualTotal: 61600,
      receivedBy: { name: expect.any(String) },
      attachments: [{ id: attachmentId, mime: 'image/jpeg' }],
    });

    // Latest price comes from the receipt now.
    const carrotNow = (
      await call<IngredientListItem>('GET', `/api/ingredients/${ing['RAU-001']!.id}`, staffQ1)
    ).body;
    expect(carrotNow.latestPrice).toMatchObject({ unitPrice: 22000, prevUnitPrice: 20000 });
    const receipts = await app.db
      .select()
      .from(ingredientPrices)
      .where(eq(ingredientPrices.source, 'po_receipt'));
    expect(receipts).toHaveLength(1); // not-delivered line records no price

    // Photo is viewable by the branch, hidden from other branches.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/attachments/${attachmentId}`,
          headers: managerQ1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/attachments/${attachmentId}`,
          headers: managerQ3,
        })
      ).statusCode,
    ).toBe(404);

    const logs = await app.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(logs.map((l) => l.action)).toEqual(['create', 'approve', 'mark_ordered', 'receive']);
  });

  it('cannot receive before approval, and a PO without supplier records no price', async () => {
    const r = await placeOrder();
    const noSup = po(r, null).id;
    const d = (await call<PoDetail>('GET', `/api/purchase-orders/${noSup}`, staffQ1)).body;
    const items = [{ id: d.items[0]!.id, qtyReceived: '4', actualUnitPrice: 30000 }];
    expect(
      (await call('POST', `/api/purchase-orders/${noSup}/receive`, staffQ1, { items })).status,
    ).toBe(409);
    await call('POST', `/api/purchase-orders/${noSup}/approve`, managerQ1, {});
    expect(
      (await call('POST', `/api/purchase-orders/${noSup}/receive`, staffQ1, { items })).status,
    ).toBe(200);
    expect(
      await app.db.select().from(ingredientPrices).where(eq(ingredientPrices.source, 'po_receipt')),
    ).toHaveLength(0);
  });

  it('staff may cancel only their own submitted PO', async () => {
    const id = po(await placeOrder(), 'HS71').id;
    expect(
      (await call<PoDetail>('POST', `/api/purchase-orders/${id}/cancel`, staffQ1, {})).body.status,
    ).toBe('cancelled');
    const id2 = po(await placeOrder(), 'HS71').id;
    await call('POST', `/api/purchase-orders/${id2}/approve`, managerQ1, {});
    expect((await call('POST', `/api/purchase-orders/${id2}/cancel`, staffQ1, {})).status).toBe(
      403,
    );
  });
});

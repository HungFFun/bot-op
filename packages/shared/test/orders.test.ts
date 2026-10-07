import { describe, expect, it } from 'vitest';
import {
  formatQty,
  lineTotal,
  orderCreateSchema,
  poReceiveSchema,
  qtyToMilli,
  supplierMessage,
} from '../src';

describe('quantity math', () => {
  it('converts quantities to thousandths', () => {
    expect(qtyToMilli('3')).toBe(3000n);
    expect(qtyToMilli('2.5')).toBe(2500n);
    expect(qtyToMilli('0.125')).toBe(125n);
  });

  it('computes line totals in integer đồng, rounding half up', () => {
    expect(lineTotal('3', 35000)).toBe(105000);
    expect(lineTotal('2.5', 145000)).toBe(362500);
    expect(lineTotal('0.333', 1000)).toBe(333);
    expect(lineTotal('1.5', 3)).toBe(5); // 4.5 → 5
  });

  it('formats with a Vietnamese decimal comma and no trailing zeros', () => {
    expect(formatQty('2.500')).toBe('2,5');
    expect(formatQty('3.000')).toBe('3');
    expect(formatQty('10')).toBe('10');
    expect(formatQty('10000.000')).toBe('10.000');
    expect(formatQty('1250.5')).toBe('1.250,5');
  });
});

describe('supplierMessage', () => {
  it('matches the copyable template from docs/02', () => {
    expect(
      supplierMessage({
        code: 'PO-261006-0012',
        branchName: 'BamThai CN Q1',
        neededDate: '2026-10-06',
        note: 'giao trước 9h',
        items: [
          { name: 'Xà lách lolo', qty: '3.000', unit: 'kg' },
          { name: 'Cà chua', qty: '2.500', unit: 'kg' },
        ],
      }),
    ).toBe(
      'BamThai CN Q1 đặt hàng ngày 06/10 (giao trước 9h):\n- Xà lách lolo: 3 kg\n- Cà chua: 2,5 kg\nMã đơn: PO-261006-0012. Cảm ơn anh/chị!',
    );
  });
});

describe('supplierMessage line notes', () => {
  it('appends a per-item note in parentheses', () => {
    const text = supplierMessage({
      code: 'PO-261007-0001',
      branchName: 'CN Q1',
      neededDate: '2026-10-07',
      note: null,
      items: [{ name: 'Thơm trái', qty: '5', unit: 'trái', note: 'trái vừa, còn lá' }],
    });
    expect(text).toContain('- Thơm trái: 5 trái (trái vừa, còn lá)');
    expect(text.split('\n')[0]).toBe('CN Q1 đặt hàng ngày 07/10:');
  });
});

describe('orderCreateSchema', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('rejects empty carts, zero quantities and duplicate lines', () => {
    expect(orderCreateSchema.safeParse({ neededDate: '2026-10-06', items: [] }).success).toBe(
      false,
    );
    expect(
      orderCreateSchema.safeParse({
        neededDate: '2026-10-06',
        items: [{ ingredientId: id, qty: '0' }],
      }).success,
    ).toBe(false);
    const dup = orderCreateSchema.safeParse({
      neededDate: '2026-10-06',
      items: [
        { ingredientId: id, qty: '1' },
        { ingredientId: id, qty: '2' },
      ],
    });
    expect(dup.success).toBe(false);
  });
});

describe('poReceiveSchema', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('requires a price only for lines actually received', () => {
    expect(poReceiveSchema.safeParse({ items: [{ id, qtyReceived: '0' }] }).success).toBe(true);
    const r = poReceiveSchema.safeParse({ items: [{ id, qtyReceived: '2' }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Vui lòng nhập đơn giá thực tế');
  });
});

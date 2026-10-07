import { describe, expect, it } from 'vitest';
import { ingredientInputSchema, normalizeVi, priceChangePct, qtySchema } from '../src';

describe('normalizeVi', () => {
  it('strips diacritics so unaccented queries match', () => {
    expect(normalizeVi('Xà lách  LOLO')).toBe('xa lach lolo');
    expect(normalizeVi('Đậu hũ chiên')).toBe('dau hu chien');
    expect(normalizeVi('Ba chỉ heo')).toContain(normalizeVi('ba chi'));
  });

  it('handles precomposed and decomposed input the same way', () => {
    expect(normalizeVi('Cà chua'.normalize('NFC'))).toBe(normalizeVi('Cà chua'.normalize('NFD')));
  });
});

describe('ingredientInputSchema', () => {
  it('uppercases the code and turns empty note into null', () => {
    const r = ingredientInputSchema.parse({
      code: ' rau-012 ',
      name: 'Xà lách',
      unit: 'kg',
      note: '',
    });
    expect(r.code).toBe('RAU-012');
    expect(r.note).toBeNull();
  });

  it('rejects codes with diacritics or spaces', () => {
    expect(ingredientInputSchema.safeParse({ code: 'RAU 01', name: 'x', unit: 'kg' }).success).toBe(
      false,
    );
    expect(ingredientInputSchema.safeParse({ code: 'RÂU-01', name: 'x', unit: 'kg' }).success).toBe(
      false,
    );
  });
});

describe('qtySchema', () => {
  it.each([
    [3, '3'],
    ['2,5', '2.5'],
    ['0.125', '0.125'],
  ])('%s → %s', (input, out) => {
    expect(qtySchema.parse(input)).toBe(out);
  });

  it('rejects more than 3 decimals and negatives', () => {
    expect(qtySchema.safeParse('1.2345').success).toBe(false);
    expect(qtySchema.safeParse('-1').success).toBe(false);
  });
});

describe('priceChangePct', () => {
  it('computes rounded percent change', () => {
    expect(priceChangePct(36750, 35000)).toBe(5);
    expect(priceChangePct(30000, 35000)).toBe(-14);
    expect(priceChangePct(30000, null)).toBeNull();
  });
});

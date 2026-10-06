import { describe, expect, it } from 'vitest';
import { loginBodySchema, phoneSchema } from '../src';

describe('phoneSchema', () => {
  it.each(['0901234567', '090 123 4567', '090.123.4567', '+84901234567', '84901234567'])(
    'normalizes %s',
    (input) => {
      expect(phoneSchema.parse(input)).toBe('0901234567');
    },
  );

  it.each(['090123456', '1901234567', 'abc'])('rejects %s', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('requires a 6-digit PIN', () => {
    const r = loginBodySchema.safeParse({ phone: '0901234567', pin: '12345' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('PIN gồm đúng 6 chữ số');
  });
});

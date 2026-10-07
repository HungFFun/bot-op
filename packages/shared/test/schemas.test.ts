import { describe, expect, it } from 'vitest';
import { loginBodySchema, phoneSchema, userCreateSchema, usernameSchema } from '../src';

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

describe('usernameSchema', () => {
  it('lowercases and trims', () => {
    expect(usernameSchema.parse('  Hung ')).toBe('hung');
  });

  it.each(['ab', 'hưng', 'a b', 'x'.repeat(33)])('rejects %s', (input) => {
    expect(usernameSchema.safeParse(input).success).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('lowercases the username so login is case-insensitive', () => {
    expect(loginBodySchema.parse({ username: 'HUNG', password: 'any-password' }).username).toBe(
      'hung',
    );
  });

  it('requires a password', () => {
    const r = loginBodySchema.safeParse({ username: 'hung', password: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Vui lòng nhập mật khẩu');
  });
});

describe('userCreateSchema', () => {
  const base = { username: 'tuan', password: '123456', name: 'Tuấn' };
  const branchId = '00000000-0000-4000-8000-000000000001';

  it('requires a branch for staff and manager', () => {
    const r = userCreateSchema.safeParse({ ...base, role: 'staff' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['branchId']);
    expect(userCreateSchema.safeParse({ ...base, role: 'staff', branchId }).success).toBe(true);
  });

  it('allows owner and accountant without a branch', () => {
    expect(userCreateSchema.safeParse({ ...base, role: 'accountant' }).success).toBe(true);
  });

  it('enforces minimum password length and turns empty phone into null', () => {
    expect(userCreateSchema.safeParse({ ...base, role: 'owner', password: '12345' }).success).toBe(
      false,
    );
    expect(userCreateSchema.parse({ ...base, role: 'owner', phone: '' }).phone).toBeNull();
  });
});

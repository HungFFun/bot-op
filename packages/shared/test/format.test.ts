import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDayMonth, formatVnd, toVnd, yymmdd } from '../src';

describe('formatVnd', () => {
  it.each([
    [0n, '0đ'],
    [999, '999đ'],
    [1000, '1.000đ'],
    [1250000n, '1.250.000đ'],
    ['2180000', '2.180.000đ'],
    [-350000, '-350.000đ'],
    [9_007_199_254_740_993n, '9.007.199.254.740.993đ'],
  ])('%s → %s', (input, expected) => {
    expect(formatVnd(input)).toBe(expected);
  });

  it('rejects non-integer amounts', () => {
    expect(() => toVnd(1.5)).toThrow(RangeError);
    expect(() => toVnd('12.5')).toThrow(RangeError);
  });
});

describe('VN date formatting', () => {
  // 2026-10-05T17:30Z is 00:30 on 06/10 in Vietnam (UTC+7)
  const instant = '2026-10-05T17:30:00Z';

  it('uses Asia/Ho_Chi_Minh regardless of host timezone', () => {
    expect(formatDayMonth(instant)).toBe('06/10');
    expect(formatDate(instant)).toBe('06/10/2026');
    expect(formatDateTime(instant)).toBe('00:30 06/10/2026');
    expect(yymmdd(instant)).toBe('261006');
  });
});

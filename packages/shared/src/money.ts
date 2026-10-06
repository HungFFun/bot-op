/** Money is always an integer number of đồng. Never use floats for money. */
export type Vnd = bigint;

/** 1250000 → "1.250.000đ". Accepts bigint, safe integer, or integer string (as stored by Postgres bigint). */
export function formatVnd(amount: bigint | number | string): string {
  const value = toVnd(amount);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}đ`;
}

export function toVnd(amount: bigint | number | string): Vnd {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount)) throw new RangeError(`Invalid VND amount: ${amount}`);
    return BigInt(amount);
  }
  if (!/^-?\d+$/.test(amount)) throw new RangeError(`Invalid VND amount: ${amount}`);
  return BigInt(amount);
}

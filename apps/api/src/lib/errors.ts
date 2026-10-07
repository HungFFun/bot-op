/** Error with a user-facing Vietnamese message. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly rowErrors?: { row: number; message: string }[],
  ) {
    super(message);
  }
}

export const unauthorized = () => new AppError(401, 'unauthorized', 'Vui lòng đăng nhập');
export const forbidden = () =>
  new AppError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này');
export const notFound = (what = 'Dữ liệu') =>
  new AppError(404, 'not_found', `${what} không tồn tại`);

export const conflict = (message: string) => new AppError(409, 'conflict', message);

type PgErrorLike = { code?: string; constraint_name?: string; cause?: unknown };

/** Postgres error (code + constraint) from a driver error or Drizzle's wrapper around it. */
export function pgError(err: unknown): { code: string; constraint?: string } | null {
  for (
    let e = err as PgErrorLike | undefined;
    e && typeof e === 'object';
    e = e.cause as PgErrorLike
  ) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: e.constraint_name };
    }
  }
  return null;
}

export const isUniqueViolation = (err: unknown) => pgError(err)?.code === '23505';
export const isForeignKeyViolation = (err: unknown) => pgError(err)?.code === '23503';

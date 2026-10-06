/** Error with a user-facing Vietnamese message. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new AppError(401, 'unauthorized', 'Vui lòng đăng nhập');
export const forbidden = () =>
  new AppError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này');
export const notFound = (what = 'Dữ liệu') =>
  new AppError(404, 'not_found', `${what} không tồn tại`);

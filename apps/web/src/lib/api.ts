import { apiErrorSchema, type ImportRowError } from '@bot-op/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly rowErrors?: ImportRowError[],
  ) {
    super(message);
  }
}

/**
 * Fetch wrapper for /api. `body` is sent as JSON, or as-is when it is FormData.
 * Throws ApiRequestError carrying the server's Vietnamese message.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers:
        init.body === undefined || isForm ? undefined : { 'content-type': 'application/json' },
      body:
        init.body === undefined
          ? undefined
          : isForm
            ? (init.body as FormData)
            : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(
      0,
      'network',
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
  }

  const data: unknown = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw parsed.success
      ? new ApiRequestError(
          res.status,
          parsed.data.error,
          parsed.data.message,
          parsed.data.rowErrors,
        )
      : new ApiRequestError(res.status, 'unknown', 'Có lỗi xảy ra, vui lòng thử lại');
  }
  return data as T;
}

import { z } from 'zod';
import { apiBaseUrl } from '../config/api';

let csrfToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};
export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string(),
});
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson(path, 'GET', undefined, schema, signal);
}
export function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return requestJson(path, method, body, schema);
}
async function requestJson<T>(
  path: string,
  method: string,
  payload: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(method === 'GET'
          ? {}
          : {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiClientError('無法連線至後端，請確認 API 服務已啟動。', 'NETWORK_ERROR', 0);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(
      '後端回傳了無法辨識的回應，請檢查 API 位址。',
      'INVALID_RESPONSE',
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      unauthorizedListeners.forEach((listener) => listener());
    const parsed = errorSchema.safeParse(body);
    if (parsed.success)
      throw new ApiClientError(
        parsed.data.error.message,
        parsed.data.error.code,
        response.status,
        parsed.data.requestId,
      );
    throw new ApiClientError('後端服務暫時無法使用，請稍後重試。', 'HTTP_ERROR', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiClientError(
      'API 回應格式不符合預期，請確認前後端版本。',
      'INVALID_RESPONSE',
      response.status,
    );
  return parsed.data;
}

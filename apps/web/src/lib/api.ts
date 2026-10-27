import type { ApiErrorBody } from '@kidora/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const SERVER_DOWN = 'Sunucuya ulaşılamıyor. API çalışıyor mu? (npm run dev:server)';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', SERVER_DOWN);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  // The Vite proxy answers with a non-JSON 5xx when the API process isn't running.
  if (!data && res.status >= 500) throw new ApiError(res.status, 'SERVER_DOWN', SERVER_DOWN);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
};

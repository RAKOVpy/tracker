import { ApiError, AuthError, NetworkError, NotFoundError } from './types';

/**
 * Запросы к серверу трекера. Вход — сессионная кука (httpOnly, её не видит JavaScript),
 * запросы с изменениями подписываются CSRF-токеном из куки csrftoken. В каждом запросе —
 * часовой пояс браузера: по нему сервер считает «сегодня» (следующий повтор задачи, дата заметки).
 */

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Что искали — для текста ошибки 404. */
  what?: string;
  /** Своя ошибка для ответа 400 — например, VacationError, которую форма отпуска показывает у полей. */
  invalid?: (message: string) => Error;
}

export interface Http {
  request<T>(method: Method, path: string, body?: unknown, options?: RequestOptions): Promise<T>;
}

/** Большая резервная копия грузится дольше обычного запроса. */
const TIMEOUT_MS = 60_000;

function cookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function detailOf(data: unknown): string | null {
  const detail = data && typeof data === 'object' ? (data as { detail?: unknown }).detail : null;
  return typeof detail === 'string' && detail ? detail : null;
}

const listeners = new Set<() => void>();

/** Сервер ответил 401: сессия закончилась или из аккаунта вышли в другой вкладке. */
export function onUnauthorized(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createHttp(baseUrl: string): Http {
  const base = baseUrl.replace(/\/+$/, '');

  async function send(method: Method, path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const zone = browserTimeZone();
    if (zone) headers['X-Timezone'] = zone;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      const token = cookie('csrftoken');
      if (token) headers['X-CSRFToken'] = token;
    }
    try {
      return await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new NetworkError('Сервер не ответил вовремя. Попробуйте ещё раз.');
      }
      throw new NetworkError();
    }
  }

  async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    let response = await send(method, path, body);
    let data = response.ok ? null : await readJson(response);

    // Куки CSRF нет (её удалили вместе с данными сайта) — сервер выдаст новую, запрос повторяется один раз.
    if (response.status === 403 && detailOf(data)?.startsWith('CSRF')) {
      await send('GET', '/auth/session/', undefined);
      response = await send(method, path, body);
      data = response.ok ? null : await readJson(response);
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const json = await readJson(response);
      if (json === null) throw new ApiError('Сервер прислал непонятный ответ. Обновите страницу.', response.status);
      return json as T;
    }

    const detail = detailOf(data);
    if (response.status === 401) {
      for (const listener of listeners) listener();
      throw new AuthError();
    }
    if (response.status === 404) throw new NotFoundError(options.what ?? 'Запись');
    if (response.status >= 500 || detail === null) {
      throw new ApiError('Сервер не смог выполнить запрос. Попробуйте ещё раз чуть позже.', response.status);
    }
    if (response.status === 400 && options.invalid) throw options.invalid(detail);
    throw new ApiError(detail, response.status);
  }

  return { request };
}

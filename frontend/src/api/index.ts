import { createAuthApi, type AuthApi } from './auth';
import { createHttp } from './http';
import { createHttpApi } from './httpApi';
import { localApi } from './localApi';
import { parseBackup, systemCtx, type Db } from './schema';
import { createServerApi, type ServerApi } from './server';
import type { TrackerApi } from './types';

/**
 * Где хранятся данные, решается при сборке: с VITE_API_URL (например, /api) — на сервере,
 * нужен вход; без неё — в этом браузере, как до появления бэкенда (см. docs/ARCHITECTURE.md).
 */
const apiUrl = import.meta.env.VITE_API_URL?.trim() || null;
const http = apiUrl ? createHttp(apiUrl) : null;

export const api: TrackerApi = http ? createHttpApi(http) : localApi;
/** null — сервера нет, данные в браузере и входить не нужно. */
export const auth: AuthApi | null = http ? createAuthApi(http) : null;
/** Регистрация и аккаунты — для администратора сервера. null — сервера нет. */
export const server: ServerApi | null = http ? createServerApi(http) : null;
/** Данные на сервере: тексты в настройках и подсказки зависят от этого. */
export const serverMode = http !== null;

export { onUnauthorized } from './http';
export { ApiError, AuthError, NetworkError, NotFoundError, VacationError } from './types';
export type { TrackerApi } from './types';
export type { Session, User } from './auth';
export type { Account } from './server';
export { DataError, type Backup, type Db } from './schema';

/** Читает файл резервной копии: проверяет и при необходимости мигрирует. Бросает DataError. */
export function readBackup(text: string): Db {
  return parseBackup(text, systemCtx());
}

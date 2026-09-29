import { localApi } from './localApi';
import { parseBackup, systemCtx, type Db } from './schema';
import type { TrackerApi } from './types';

// Когда появится бэкенд на DRF, здесь подключится HTTP-реализация (см. docs/ARCHITECTURE.md).
export const api: TrackerApi = localApi;

export { NotFoundError } from './types';
export type { TrackerApi } from './types';
export { DataError, type Backup, type Db } from './schema';

/** Читает файл резервной копии: проверяет и при необходимости мигрирует. Бросает DataError. */
export function readBackup(text: string): Db {
  return parseBackup(text, systemCtx());
}

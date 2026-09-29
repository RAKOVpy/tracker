import { localApi } from './localApi';
import type { TrackerApi } from './types';

// Когда появится бэкенд на DRF, здесь подключится HTTP-реализация (см. docs/ARCHITECTURE.md).
export const api: TrackerApi = localApi;

export { NotFoundError } from './types';
export type { TrackerApi } from './types';

import type {
  Area,
  AreaInput,
  AreaPatch,
  EntryInput,
  Goal,
  GoalInput,
  GoalPatch,
  ProgressEntry,
} from '../domain/types';
import type { Backup, Db } from './schema';

/**
 * Контракт хранилища. UI работает только через него, поэтому localStorage-реализацию
 * можно заменить HTTP-клиентом к DRF, не трогая компоненты.
 */
export interface TrackerApi {
  listAreas(): Promise<Area[]>;
  createArea(input: AreaInput): Promise<Area>;
  updateArea(id: string, patch: AreaPatch): Promise<Area>;
  /** Цели удалённой сферы остаются без сферы. */
  deleteArea(id: string): Promise<void>;

  listGoals(): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal>;
  createGoal(input: GoalInput): Promise<Goal>;
  updateGoal(id: string, patch: GoalPatch): Promise<Goal>;
  deleteGoal(id: string): Promise<void>;

  /** Без goalId — записи по всем целям (нужно главному экрану). */
  listEntries(goalId?: string): Promise<ProgressEntry[]>;
  createEntry(input: EntryInput): Promise<ProgressEntry>;
  deleteEntry(id: string): Promise<void>;

  exportData(): Promise<Backup>;
  /** Полностью заменяет данные. Данные уже проверены (см. parseBackup). */
  importData(db: Db): Promise<void>;
  /** Удаляет всё и создаёт сферы по умолчанию. */
  resetData(): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} не найдено`);
    this.name = 'NotFoundError';
  }
}

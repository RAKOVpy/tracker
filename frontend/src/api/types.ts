import type { EntryInput, Goal, GoalInput, GoalPatch, ProgressEntry } from '../domain/types';

/**
 * Контракт хранилища. UI работает только через него, поэтому localStorage-реализацию
 * можно заменить HTTP-клиентом к DRF, не трогая компоненты.
 */
export interface TrackerApi {
  listGoals(): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal>;
  createGoal(input: GoalInput): Promise<Goal>;
  updateGoal(id: string, patch: GoalPatch): Promise<Goal>;
  deleteGoal(id: string): Promise<void>;

  /** Без goalId — записи по всем целям (нужно главному экрану). */
  listEntries(goalId?: string): Promise<ProgressEntry[]>;
  createEntry(input: EntryInput): Promise<ProgressEntry>;
  deleteEntry(id: string): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} не найдено`);
    this.name = 'NotFoundError';
  }
}

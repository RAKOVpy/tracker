import type {
  Area,
  AreaInput,
  AreaPatch,
  EntryInput,
  Goal,
  GoalInput,
  GoalPatch,
  Material,
  MaterialInput,
  MaterialPatch,
  Note,
  NoteInput,
  NotePatch,
  ProgressEntry,
  Review,
  ReviewInput,
  Settings,
  SettingsPatch,
  Task,
  TaskInput,
  TaskPatch,
  Vacation,
  VacationInput,
} from '../domain/types';
import type { IsoDate } from '../lib/dates';
import type { ParsedVault, SyncReport } from '../obsidian/sync';
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

  listMaterials(): Promise<Material[]>;
  createMaterial(input: MaterialInput): Promise<Material>;
  updateMaterial(id: string, patch: MaterialPatch): Promise<Material>;
  /** Заметки удалённого материала остаются без материала. */
  deleteMaterial(id: string): Promise<void>;

  listNotes(): Promise<Note[]>;
  /** addedOn по умолчанию — сегодня; другое значение нужно при импорте и в демо-данных. */
  createNote(input: NoteInput, options?: { addedOn?: IsoDate }): Promise<Note>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  /** Удаляет заметку вместе с журналом её повторений. */
  deleteNote(id: string): Promise<void>;

  listReviews(): Promise<Review[]>;
  createReview(input: ReviewInput): Promise<Review>;
  /** Отмена оценки: расписание заметки пересчитается без неё. */
  deleteReview(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;

  /** Отпуска по дате начала. */
  listVacations(): Promise<Vacation[]>;
  /** Бросает VacationError, если даты неверны или пересекаются с другим отпуском. */
  createVacation(input: VacationInput): Promise<Vacation>;
  updateVacation(id: string, input: VacationInput): Promise<Vacation>;
  deleteVacation(id: string): Promise<void>;

  /** Задачи вместе со «Входящими» (статус inbox). */
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  /** При смене статуса на done/cancelled запоминается время, при возврате — сбрасывается. */
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  /** Переносит заметки и материалы из хранилища Obsidian (см. obsidian/sync.ts). */
  syncObsidian(vault: ParsedVault): Promise<SyncReport>;

  exportData(): Promise<Backup>;
  /** Полностью заменяет данные. Данные уже проверены (см. parseBackup). */
  importData(db: Db): Promise<void>;
  /** Удаляет всё и создаёт сферы по умолчанию. */
  resetData(): Promise<void>;
}

export class VacationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VacationError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} не найдено`);
    this.name = 'NotFoundError';
  }
}

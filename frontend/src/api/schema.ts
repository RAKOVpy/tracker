import { AREA_COLORS, AREA_ICONS, DEFAULT_AREAS } from '../domain/meta';
import type {
  Area,
  ExplainAnswer,
  Goal,
  GoalStatus,
  Material,
  MaterialStatus,
  MaterialType,
  Note,
  Priority,
  ProgressEntry,
  Rating,
  Review,
} from '../domain/types';

/**
 * Схема данных в хранилище и в файлах резервных копий.
 * При изменении модели: увеличить SCHEMA_VERSION и добавить шаг в MIGRATIONS.
 */
export const SCHEMA_VERSION = 3;

export interface Db {
  areas: Area[];
  goals: Goal[];
  entries: ProgressEntry[];
  materials: Material[];
  notes: Note[];
  reviews: Review[];
}

export interface Backup extends Db {
  app: 'tracker';
  version: number;
  exportedAt: string;
}

/** Источник id и текущего времени — подменяется в тестах. */
export interface Ctx {
  now: string;
  newId: () => string;
}

export function systemCtx(): Ctx {
  return { now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

export function createEmptyDb(ctx: Ctx): Db {
  return { areas: createDefaultAreas(ctx), goals: [], entries: [], materials: [], notes: [], reviews: [] };
}

function createDefaultAreas(ctx: Ctx): Area[] {
  return DEFAULT_AREAS.map((area, order) => ({ ...area, id: ctx.newId(), order, createdAt: ctx.now }));
}

// ---------- миграции ----------

type Raw = Record<string, unknown>;

/** v1 → v2: жёсткие категории цели заменены сферами, которые пользователь может менять. */
function v1ToV2(raw: Raw, ctx: Ctx): Raw {
  const areas = createDefaultAreas(ctx);
  const byCategory: Record<string, string | null> = {
    reading: areas[0].id,
    language: areas[1].id,
    sport: areas[2].id,
    study: areas[3].id,
    other: null,
  };
  const goals = asArray(raw.goals, 'goals').map((goal) => {
    const { category, ...rest } = asObject(goal, 'goal');
    return { ...rest, areaId: typeof category === 'string' ? (byCategory[category] ?? null) : null };
  });
  return { ...raw, areas, goals };
}

/** v2 → v3: появились знания — материалы, заметки и журнал повторений. */
function v2ToV3(raw: Raw): Raw {
  return { ...raw, materials: [], notes: [], reviews: [] };
}

const MIGRATIONS: Record<number, (raw: Raw, ctx: Ctx) => Raw> = {
  1: v1ToV2,
  2: v2ToV3,
};

/** Приводит данные любой известной версии к текущей схеме и проверяет их. */
export function migrate(raw: unknown, ctx: Ctx): Db {
  let data = asObject(raw, 'data');
  let version = data.version === undefined ? 1 : data.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DataError('Неизвестная версия данных');
  }
  if (version > SCHEMA_VERSION) {
    throw new DataError('Данные созданы более новой версией приложения. Обновите страницу.');
  }
  while (version < SCHEMA_VERSION) {
    data = MIGRATIONS[version](data, ctx);
    version += 1;
  }
  return validateDb(data);
}

// ---------- резервные копии ----------

export function toBackup(db: Db, exportedAt: string): Backup {
  return { app: 'tracker', version: SCHEMA_VERSION, exportedAt, ...db };
}

export function parseBackup(text: string, ctx: Ctx): Db {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DataError('Файл не похож на резервную копию: это не JSON.');
  }
  if (!isObject(raw) || raw.app !== 'tracker') {
    throw new DataError('Это не резервная копия трекера.');
  }
  const { app: _app, exportedAt: _exportedAt, ...data } = raw;
  return migrate(data, ctx);
}

// ---------- проверка ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const STATUSES: GoalStatus[] = ['active', 'archived'];
const MATERIAL_TYPES: MaterialType[] = ['book', 'course', 'lecture', 'article', 'video', 'other'];
const MATERIAL_STATUSES: MaterialStatus[] = ['queued', 'active', 'done', 'dropped'];
const NOTE_STATUSES: Note['status'][] = ['active', 'paused'];
const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];
const EXPLAIN_ANSWERS: ExplainAnswer[] = ['no', 'hints', 'yes'];

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, what: string): Raw {
  if (!isObject(value)) throw new DataError(`Ожидался объект: ${what}`);
  return value;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new DataError(`Ожидался список: ${what}`);
  return value;
}

function str(obj: Raw, key: string, where: string, { allowEmpty = false } = {}): string {
  const value = obj[key];
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new DataError(`${where}: поле «${key}» должно быть непустой строкой`);
  }
  return value;
}

function num(obj: Raw, key: string, where: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DataError(`${where}: поле «${key}» должно быть числом`);
  }
  return value;
}

function date(obj: Raw, key: string, where: string): string {
  const value = str(obj, key, where);
  if (!ISO_DATE.test(value)) throw new DataError(`${where}: поле «${key}» должно быть датой ГГГГ-ММ-ДД`);
  return value;
}

function oneOf<T extends string>(obj: Raw, key: string, allowed: readonly T[], where: string): T {
  const value = obj[key];
  if (!allowed.includes(value as T)) throw new DataError(`${where}: недопустимое значение поля «${key}»`);
  return value as T;
}

function bool(obj: Raw, key: string, where: string): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') throw new DataError(`${where}: поле «${key}» должно быть true или false`);
  return value;
}

function strings(obj: Raw, key: string, where: string): string[] {
  const value = obj[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new DataError(`${where}: поле «${key}» должно быть списком строк`);
  }
  return value as string[];
}

function uniqueIds(items: { id: string }[], what: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new DataError(`${what}: повторяется id ${item.id}`);
    seen.add(item.id);
  }
}

/**
 * Проверяет данные и возвращает чистую копию только с известными полями.
 * Висячие ссылки чинятся: цель или материал удалённой сферы остаются без сферы, заметка удалённого
 * материала — без материала, записи и повторения удалённых целей и заметок отбрасываются.
 */
export function validateDb(raw: unknown): Db {
  const data = asObject(raw, 'data');

  const areas: Area[] = asArray(data.areas, 'areas').map((item, i) => {
    const a = asObject(item, `Сфера ${i + 1}`);
    const where = `Сфера ${i + 1}`;
    return {
      id: str(a, 'id', where),
      name: str(a, 'name', where),
      color: oneOf(a, 'color', AREA_COLORS, where),
      icon: oneOf(a, 'icon', AREA_ICONS, where),
      order: num(a, 'order', where),
      createdAt: str(a, 'createdAt', where),
    };
  });
  uniqueIds(areas, 'Сферы');
  const areaIds = new Set(areas.map((a) => a.id));

  const goals: Goal[] = asArray(data.goals, 'goals').map((item, i) => {
    const g = asObject(item, `Цель ${i + 1}`);
    const where = `Цель ${i + 1}`;
    const areaId = typeof g.areaId === 'string' && areaIds.has(g.areaId) ? g.areaId : null;
    const goal: Goal = {
      id: str(g, 'id', where),
      title: str(g, 'title', where),
      description: str(g, 'description', where, { allowEmpty: true }),
      areaId,
      unit: str(g, 'unit', where),
      targetValue: num(g, 'targetValue', where),
      startDate: date(g, 'startDate', where),
      deadline: date(g, 'deadline', where),
      priority: oneOf(g, 'priority', PRIORITIES, where),
      status: oneOf(g, 'status', STATUSES, where),
      createdAt: str(g, 'createdAt', where),
    };
    if (goal.targetValue <= 0) throw new DataError(`${where}: цель должна быть больше нуля`);
    if (goal.deadline < goal.startDate) throw new DataError(`${where}: дедлайн раньше даты старта`);
    return goal;
  });
  uniqueIds(goals, 'Цели');
  const goalIds = new Set(goals.map((g) => g.id));

  const entries: ProgressEntry[] = asArray(data.entries, 'entries')
    .map((item, i) => {
      const e = asObject(item, `Запись ${i + 1}`);
      const where = `Запись ${i + 1}`;
      const entry: ProgressEntry = {
        id: str(e, 'id', where),
        goalId: str(e, 'goalId', where),
        date: date(e, 'date', where),
        value: num(e, 'value', where),
        note: str(e, 'note', where, { allowEmpty: true }),
        createdAt: str(e, 'createdAt', where),
      };
      if (entry.value <= 0) throw new DataError(`${where}: значение должно быть больше нуля`);
      return entry;
    })
    .filter((entry) => goalIds.has(entry.goalId));
  uniqueIds(entries, 'Записи');

  const materials: Material[] = asArray(data.materials, 'materials').map((item, i) => {
    const m = asObject(item, `Материал ${i + 1}`);
    const where = `Материал ${i + 1}`;
    return {
      id: str(m, 'id', where),
      title: str(m, 'title', where),
      type: oneOf(m, 'type', MATERIAL_TYPES, where),
      author: str(m, 'author', where, { allowEmpty: true }),
      url: str(m, 'url', where, { allowEmpty: true }),
      areaId: typeof m.areaId === 'string' && areaIds.has(m.areaId) ? m.areaId : null,
      status: oneOf(m, 'status', MATERIAL_STATUSES, where),
      createdAt: str(m, 'createdAt', where),
    };
  });
  uniqueIds(materials, 'Материалы');
  const materialIds = new Set(materials.map((m) => m.id));

  const notes: Note[] = asArray(data.notes, 'notes').map((item, i) => {
    const n = asObject(item, `Заметка ${i + 1}`);
    const where = `Заметка ${i + 1}`;
    const note: Note = {
      id: str(n, 'id', where),
      title: str(n, 'title', where),
      materialId: typeof n.materialId === 'string' && materialIds.has(n.materialId) ? n.materialId : null,
      questions: strings(n, 'questions', where),
      summary: str(n, 'summary', where, { allowEmpty: true }),
      obsidianUri: str(n, 'obsidianUri', where, { allowEmpty: true }),
      status: oneOf(n, 'status', NOTE_STATUSES, where),
      addedOn: date(n, 'addedOn', where),
      createdAt: str(n, 'createdAt', where),
    };
    if (note.obsidianUri && !note.obsidianUri.startsWith('obsidian://')) {
      throw new DataError(`${where}: ссылка на Obsidian должна начинаться с obsidian://`);
    }
    return note;
  });
  uniqueIds(notes, 'Заметки');
  const noteIds = new Set(notes.map((n) => n.id));

  const reviews: Review[] = asArray(data.reviews, 'reviews')
    .map((item, i) => {
      const r = asObject(item, `Повторение ${i + 1}`);
      const where = `Повторение ${i + 1}`;
      return {
        id: str(r, 'id', where),
        noteId: str(r, 'noteId', where),
        date: date(r, 'date', where),
        rating: oneOf(r, 'rating', RATINGS, where),
        explain: r.explain === null ? null : oneOf(r, 'explain', EXPLAIN_ANSWERS, where),
        taught: bool(r, 'taught', where),
        createdAt: str(r, 'createdAt', where),
      };
    })
    .filter((review) => noteIds.has(review.noteId));
  uniqueIds(reviews, 'Повторения');

  return { areas, goals, entries, materials, notes, reviews };
}

import type { Area, Goal, ProgressEntry } from '../domain/types';
import { createEmptyDb, migrate, SCHEMA_VERSION, systemCtx, toBackup, type Db } from './schema';
import { NotFoundError, type TrackerApi } from './types';

const STORAGE_KEY = 'tracker:data';
/** Ключ версии 1. Не удаляется после миграции и служит запасной копией. */
const LEGACY_KEY = 'tracker:v1';

function save(db: Db): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...db }));
}

/**
 * Читает данные, при необходимости мигрирует старую версию и сохраняет результат.
 * Если данные повреждены, бросает DataError: молча начинать с чистого листа нельзя.
 */
function load(): Db {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    const db = migrate(parsed, systemCtx());
    if ((parsed as { version?: unknown }).version !== SCHEMA_VERSION) save(db);
    return db;
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  const db = legacy !== null ? migrate(JSON.parse(legacy), systemCtx()) : createEmptyDb(systemCtx());
  save(db);
  return db;
}

function findIndex<T extends { id: string }>(items: T[], id: string, what: string): number {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new NotFoundError(what);
  return index;
}

/** Хранилище в браузере — до появления бэкенда. */
export const localApi: TrackerApi = {
  async listAreas() {
    return [...load().areas].sort((a, b) => a.order - b.order);
  },

  async createArea(input) {
    const db = load();
    const order = db.areas.reduce((max, a) => Math.max(max, a.order + 1), 0);
    const area: Area = { ...input, id: crypto.randomUUID(), order, createdAt: new Date().toISOString() };
    db.areas.push(area);
    save(db);
    return area;
  },

  async updateArea(id, patch) {
    const db = load();
    const index = findIndex(db.areas, id, 'Сфера');
    db.areas[index] = { ...db.areas[index], ...patch };
    save(db);
    return db.areas[index];
  },

  async deleteArea(id) {
    const db = load();
    db.areas = db.areas.filter((a) => a.id !== id);
    db.goals = db.goals.map((g) => (g.areaId === id ? { ...g, areaId: null } : g));
    save(db);
  },

  async listGoals() {
    return load().goals;
  },

  async getGoal(id) {
    const goal = load().goals.find((g) => g.id === id);
    if (!goal) throw new NotFoundError('Цель');
    return goal;
  },

  async createGoal(input) {
    const db = load();
    const goal: Goal = { ...input, id: crypto.randomUUID(), status: 'active', createdAt: new Date().toISOString() };
    db.goals.push(goal);
    save(db);
    return goal;
  },

  async updateGoal(id, patch) {
    const db = load();
    const index = findIndex(db.goals, id, 'Цель');
    db.goals[index] = { ...db.goals[index], ...patch };
    save(db);
    return db.goals[index];
  },

  async deleteGoal(id) {
    const db = load();
    db.goals = db.goals.filter((g) => g.id !== id);
    db.entries = db.entries.filter((e) => e.goalId !== id);
    save(db);
  },

  async listEntries(goalId) {
    const { entries } = load();
    return goalId ? entries.filter((e) => e.goalId === goalId) : entries;
  },

  async createEntry(input) {
    const db = load();
    findIndex(db.goals, input.goalId, 'Цель');
    const entry: ProgressEntry = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    db.entries.push(entry);
    save(db);
    return entry;
  },

  async deleteEntry(id) {
    const db = load();
    db.entries = db.entries.filter((e) => e.id !== id);
    save(db);
  },

  async exportData() {
    return toBackup(load(), new Date().toISOString());
  },

  async importData(db) {
    save(db);
  },

  async resetData() {
    save(createEmptyDb(systemCtx()));
  },
};

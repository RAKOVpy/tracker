import type { Goal, ProgressEntry } from '../domain/types';
import { NotFoundError, type TrackerApi } from './types';

const STORAGE_KEY = 'tracker:v1';

interface Db {
  goals: Goal[];
  entries: ProgressEntry[];
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // повреждённые данные или недоступный localStorage — начинаем с пустой базы
  }
  return { goals: [], entries: [] };
}

function save(db: Db): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Хранилище в браузере — для MVP до появления бэкенда. */
export const localApi: TrackerApi = {
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
    const goal: Goal = { ...input, id: crypto.randomUUID(), status: 'active', createdAt: nowIso() };
    db.goals.push(goal);
    save(db);
    return goal;
  },

  async updateGoal(id, patch) {
    const db = load();
    const index = db.goals.findIndex((g) => g.id === id);
    if (index === -1) throw new NotFoundError('Цель');
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
    if (!db.goals.some((g) => g.id === input.goalId)) throw new NotFoundError('Цель');
    const entry: ProgressEntry = { ...input, id: crypto.randomUUID(), createdAt: nowIso() };
    db.entries.push(entry);
    save(db);
    return entry;
  },

  async deleteEntry(id) {
    const db = load();
    db.entries = db.entries.filter((e) => e.id !== id);
    save(db);
  },
};

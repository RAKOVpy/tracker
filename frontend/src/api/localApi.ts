import { applyGoalPatch } from '../domain/goals';
import { detachRemovedParts } from '../domain/parts';
import { applyProjectPatch, createProject, detachRemovedMilestones } from '../domain/projects';
import { applyTaskUpdate, createTask } from '../domain/tasks';
import type { Area, Goal, Material, Note, ProgressEntry, Review, Vacation, WeeklyReview } from '../domain/types';
import { sortVacations, vacationError } from '../domain/vacation';
import { todayIso } from '../lib/dates';
import { applyVault } from '../obsidian/sync';
import { createEmptyDb, migrate, SCHEMA_VERSION, systemCtx, toBackup, type Db } from './schema';
import { ApiError, NotFoundError, VacationError, type TrackerApi } from './types';

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
    db.materials = db.materials.map((m) => (m.areaId === id ? { ...m, areaId: null } : m));
    db.tasks = db.tasks.map((t) => (t.areaId === id ? { ...t, areaId: null } : t));
    db.projects = db.projects.map((p) => (p.areaId === id ? { ...p, areaId: null } : p));
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
    db.goals[index] = applyGoalPatch(db.goals[index], patch);
    save(db);
    return db.goals[index];
  },

  async deleteGoal(id) {
    const db = load();
    db.goals = db.goals.filter((g) => g.id !== id);
    db.entries = db.entries.filter((e) => e.goalId !== id);
    db.projects = db.projects.map((p) => (p.goalId === id ? { ...p, goalId: null } : p));
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

  async listMaterials() {
    return load().materials;
  },

  async createMaterial(input) {
    const db = load();
    const material: Material = {
      ...input,
      id: crypto.randomUUID(),
      obsidianPath: null,
      createdAt: new Date().toISOString(),
    };
    db.materials.push(material);
    save(db);
    return material;
  },

  async updateMaterial(id, patch) {
    const db = load();
    const index = findIndex(db.materials, id, 'Материал');
    db.materials[index] = { ...db.materials[index], ...patch };
    db.tasks = detachRemovedParts(db.tasks, db.materials[index]);
    save(db);
    return db.materials[index];
  },

  async deleteMaterial(id) {
    const db = load();
    db.materials = db.materials.filter((m) => m.id !== id);
    db.notes = db.notes.map((n) => (n.materialId === id ? { ...n, materialId: null } : n));
    db.tasks = db.tasks.map((t) => (t.materialId === id ? { ...t, materialId: null, partId: null } : t));
    save(db);
  },

  async listNotes() {
    return load().notes;
  },

  async createNote(input, options) {
    const db = load();
    const now = new Date();
    const note: Note = {
      ...input,
      id: crypto.randomUUID(),
      status: 'active',
      addedOn: options?.addedOn ?? todayIso(now),
      obsidianPath: null,
      createdAt: now.toISOString(),
    };
    db.notes.push(note);
    save(db);
    return note;
  },

  async updateNote(id, patch) {
    const db = load();
    const index = findIndex(db.notes, id, 'Заметка');
    db.notes[index] = { ...db.notes[index], ...patch };
    save(db);
    return db.notes[index];
  },

  async deleteNote(id) {
    const db = load();
    db.notes = db.notes.filter((n) => n.id !== id);
    db.reviews = db.reviews.filter((r) => r.noteId !== id);
    save(db);
  },

  async listReviews() {
    return load().reviews;
  },

  async createReview(input) {
    const db = load();
    findIndex(db.notes, input.noteId, 'Заметка');
    const review: Review = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    db.reviews.push(review);
    save(db);
    return review;
  },

  async deleteReview(id) {
    const db = load();
    db.reviews = db.reviews.filter((r) => r.id !== id);
    save(db);
  },

  async getSettings() {
    return load().settings;
  },

  async updateSettings(patch) {
    const db = load();
    db.settings = { ...db.settings, ...patch };
    save(db);
    return db.settings;
  },

  async listVacations() {
    return load().vacations;
  },

  async createVacation(input) {
    const db = load();
    const error = vacationError(input, db.vacations, todayIso());
    if (error) throw new VacationError(error);
    const vacation: Vacation = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    db.vacations = sortVacations([...db.vacations, vacation]);
    save(db);
    return vacation;
  },

  async updateVacation(id, input) {
    const db = load();
    const index = findIndex(db.vacations, id, 'Отпуск');
    const error = vacationError(input, db.vacations.filter((v) => v.id !== id), todayIso());
    if (error) throw new VacationError(error);
    db.vacations[index] = { ...db.vacations[index], ...input };
    db.vacations = sortVacations(db.vacations);
    save(db);
    return db.vacations.find((v) => v.id === id)!;
  },

  async deleteVacation(id) {
    const db = load();
    db.vacations = db.vacations.filter((v) => v.id !== id);
    save(db);
  },

  async listTasks() {
    return load().tasks;
  },

  async createTask(input) {
    const db = load();
    const task = createTask(input, { id: crypto.randomUUID(), now: new Date().toISOString() });
    db.tasks.push(task);
    save(db);
    return task;
  },

  async updateTask(id, patch) {
    const db = load();
    findIndex(db.tasks, id, 'Задача');
    const now = new Date();
    db.tasks = applyTaskUpdate(db.tasks, id, patch, {
      now: now.toISOString(),
      today: todayIso(now),
      newId: () => crypto.randomUUID(),
    });
    save(db);
    return db.tasks.find((t) => t.id === id)!;
  },

  async deleteTask(id) {
    const db = load();
    db.tasks = db.tasks.filter((t) => t.id !== id).map((t) => (t.repeatOf === id ? { ...t, repeatOf: null } : t));
    save(db);
  },

  async listProjects() {
    return load().projects;
  },

  async createProject(input) {
    const db = load();
    const project = createProject(input, { id: crypto.randomUUID(), now: new Date().toISOString() });
    db.projects.push(project);
    save(db);
    return project;
  },

  async updateProject(id, patch) {
    const db = load();
    const index = findIndex(db.projects, id, 'Проект');
    db.projects[index] = applyProjectPatch(db.projects[index], patch, new Date().toISOString());
    db.tasks = detachRemovedMilestones(db.tasks, db.projects[index]);
    save(db);
    return db.projects[index];
  },

  async deleteProject(id) {
    const db = load();
    db.projects = db.projects.filter((p) => p.id !== id);
    db.tasks = db.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null, milestoneId: null } : t));
    save(db);
  },

  async listWeeklyReviews() {
    return load().weeklyReviews;
  },

  async createWeeklyReview(input) {
    const db = load();
    if (db.weeklyReviews.some((r) => r.weekStart === input.weekStart)) throw new ApiError('Обзор этой недели уже есть.', 400);
    const review: WeeklyReview = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    db.weeklyReviews = [...db.weeklyReviews, review].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    save(db);
    return review;
  },

  async updateWeeklyReview(id, patch) {
    const db = load();
    const index = findIndex(db.weeklyReviews, id, 'Обзор недели');
    db.weeklyReviews[index] = { ...db.weeklyReviews[index], ...patch };
    save(db);
    return db.weeklyReviews[index];
  },

  async deleteWeeklyReview(id) {
    const db = load();
    db.weeklyReviews = db.weeklyReviews.filter((r) => r.id !== id);
    save(db);
  },

  async syncObsidian(vault) {
    const db = load();
    const now = new Date();
    const { materials, notes, report } = applyVault(db, vault, {
      today: todayIso(now),
      now: now.toISOString(),
      newId: () => crypto.randomUUID(),
    });
    save({ ...db, materials, notes });
    return report;
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

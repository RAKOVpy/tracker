import type { Material, Note } from '../domain/types';
import { todayIso } from '../lib/dates';
import { applyVault } from '../obsidian/sync';
import type { Http, RequestOptions } from './http';
import { SCHEMA_VERSION } from './schema';
import { NotFoundError, VacationError, type TrackerApi } from './types';

/** То, что applyVault изменил или создал: на сервер уходят только они. */
function changed<T extends { id: string }>(before: T[], after: T[]): T[] {
  const old = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  return after.filter((item) => old.get(item.id) !== JSON.stringify(item));
}

/**
 * Хранилище на сервере (backend/, Django REST). Правила те же, что у localApi: сервер сам создаёт
 * следующий повтор задачи, отвязывает задачи от удалённых вех и частей, проверяет отпуска.
 */
export function createHttpApi(http: Http): TrackerApi {
  const get = <T>(path: string, what?: string) => http.request<T>('GET', path, undefined, { what });
  const post = <T>(path: string, body?: unknown, options?: RequestOptions) => http.request<T>('POST', path, body, options);
  const patch = <T>(path: string, body: unknown, options?: RequestOptions) => http.request<T>('PATCH', path, body, options);
  /** Уже удалено (например, в другой вкладке) — тоже успех. */
  const remove = async (path: string) => {
    try {
      await http.request<void>('DELETE', path);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  };
  const item = (collection: string, id: string) => `/${collection}/${encodeURIComponent(id)}/`;
  const vacationRules: RequestOptions = { invalid: (message) => new VacationError(message) };

  const api: TrackerApi = {
    listAreas: () => get('/areas/'),
    createArea: (input) => post('/areas/', input),
    updateArea: (id, changes) => patch(item('areas', id), changes, { what: 'Сфера' }),
    deleteArea: (id) => remove(item('areas', id)),

    listGoals: () => get('/goals/'),
    getGoal: (id) => get(item('goals', id), 'Цель'),
    createGoal: (input) => post('/goals/', input),
    updateGoal: (id, changes) => patch(item('goals', id), changes, { what: 'Цель' }),
    deleteGoal: (id) => remove(item('goals', id)),

    listEntries: (goalId) => get(goalId ? `/entries/?goal=${encodeURIComponent(goalId)}` : '/entries/'),
    createEntry: (input) => post('/entries/', input),
    deleteEntry: (id) => remove(item('entries', id)),

    listMaterials: () => get('/materials/'),
    createMaterial: (input) => post('/materials/', input),
    updateMaterial: (id, changes) => patch(item('materials', id), changes, { what: 'Материал' }),
    deleteMaterial: (id) => remove(item('materials', id)),

    listNotes: () => get('/notes/'),
    createNote: (input, options) => post('/notes/', options?.addedOn ? { ...input, addedOn: options.addedOn } : input),
    updateNote: (id, changes) => patch(item('notes', id), changes, { what: 'Заметка' }),
    deleteNote: (id) => remove(item('notes', id)),

    listReviews: () => get('/reviews/'),
    createReview: (input) => post('/reviews/', input),
    deleteReview: (id) => remove(item('reviews', id)),

    getSettings: () => get('/settings/'),
    updateSettings: (changes) => patch('/settings/', changes),

    listVacations: () => get('/vacations/'),
    createVacation: (input) => post('/vacations/', input, vacationRules),
    updateVacation: (id, input) => patch(item('vacations', id), input, { ...vacationRules, what: 'Отпуск' }),
    deleteVacation: (id) => remove(item('vacations', id)),

    listTasks: () => get('/tasks/'),
    createTask: (input) => post('/tasks/', input),
    updateTask: (id, changes) => patch(item('tasks', id), changes, { what: 'Задача' }),
    deleteTask: (id) => remove(item('tasks', id)),

    listProjects: () => get('/projects/'),
    createProject: (input) => post('/projects/', input),
    updateProject: (id, changes) => patch(item('projects', id), changes, { what: 'Проект' }),
    deleteProject: (id) => remove(item('projects', id)),

    /** Хранилище читается в браузере, сопоставление с трекером — то же, что без сервера. */
    async syncObsidian(vault) {
      const [areas, materials, notes, settings, vacations] = await Promise.all([
        api.listAreas(),
        api.listMaterials(),
        api.listNotes(),
        api.getSettings(),
        api.listVacations(),
      ]);
      const now = new Date();
      const result = applyVault({ areas, materials, notes, settings, vacations }, vault, {
        today: todayIso(now),
        now: now.toISOString(),
        newId: () => crypto.randomUUID(),
      });
      const updates = { materials: changed<Material>(materials, result.materials), notes: changed<Note>(notes, result.notes) };
      if (updates.materials.length > 0 || updates.notes.length > 0) await post('/obsidian/apply/', updates);
      return result.report;
    },

    exportData: () => get('/export/'),
    importData: (db) => post('/import/', { version: SCHEMA_VERSION, ...db }),
    resetData: () => post('/reset/'),
  };
  return api;
}

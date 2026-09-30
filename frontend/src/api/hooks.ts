import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { computeHabitStats, type HabitWithStats } from '../domain/habits';
import { checkStart, forecastReviews, planReviews, type ForecastDay, type ReviewLoad, type StartCheck } from '../domain/load';
import { computeGoalStats, type GoalWithStats } from '../domain/progress';
import { withState, type NoteWithState } from '../domain/review';
import { tasksInWork } from '../domain/projects';
import { applyTaskPatch } from '../domain/tasks';
import type {
  Area,
  AreaInput,
  AreaPatch,
  ChecklistItem,
  EntryInput,
  GoalInput,
  GoalPatch,
  HabitGoal,
  Material,
  MaterialInput,
  MaterialPart,
  MaterialPatch,
  NoteInput,
  NotePatch,
  ProgressEntry,
  Project,
  ProjectInput,
  ProjectPatch,
  ReviewInput,
  Settings,
  SettingsPatch,
  Task,
  TaskInput,
  TaskPatch,
  Vacation,
  VacationInput,
  WeeklyReview,
  WeeklyReviewInput,
} from '../domain/types';
import { finishVacation } from '../domain/vacation';
import { todayIso, type IsoDate } from '../lib/dates';
import { api, type Db } from '.';

declare module '@tanstack/react-query' {
  interface Register {
    /** ownErrors — экран сам показывает ошибку, общее сообщение «не сохранилось» не нужно. */
    mutationMeta: { ownErrors?: boolean };
  }
}

const keys = {
  areas: ['areas'] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  entries: (goalId?: string) => (goalId ? (['entries', goalId] as const) : (['entries'] as const)),
  materials: ['materials'] as const,
  notes: ['notes'] as const,
  reviews: ['reviews'] as const,
  settings: ['settings'] as const,
  vacations: ['vacations'] as const,
  tasks: ['tasks'] as const,
  projects: ['projects'] as const,
  weeklyReviews: ['weekly-reviews'] as const,
};

/**
 * Быстрые правки одного вида (галочки задач, части материала, счётчики нагрузки) уходят на сервер
 * по очереди (scope), чтобы не обогнать друг друга в сети. Список перечитывается после последней
 * правки в очереди: иначе ответ на первую на миг вернул бы на экран состояние без следующих.
 */
const queues = {
  task: ['update-task'] as const,
  material: ['update-material'] as const,
  settings: ['update-settings'] as const,
  habit: ['toggle-habit'] as const,
  weeklyReview: ['update-weekly-review'] as const,
};

/** В обработчике завершения своя правка ещё считается незавершённой — поэтому «последняя» значит «одна». */
function isLastInQueue(client: QueryClient, mutationKey: readonly string[]): boolean {
  return client.isMutating({ mutationKey: [...mutationKey] }) <= 1;
}

/** Текущее время с точностью до минуты: экран обновится, если приложение открыто через полночь. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useToday(): string {
  return todayIso(useNow());
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item));
    if (list) list.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

export interface GoalsData {
  /** Цели к сроку. */
  targets: GoalWithStats[];
  habits: HabitWithStats[];
}

/** Цели к сроку и привычки со статистикой на сегодня. */
export function useGoals() {
  const today = useToday();
  const goals = useQuery({ queryKey: keys.goals, queryFn: () => api.listGoals() });
  const entries = useQuery({ queryKey: keys.entries(), queryFn: () => api.listEntries() });
  const vacations = useVacations();

  const data = useMemo<GoalsData | undefined>(() => {
    if (!goals.data || !entries.data || !vacations.data) return undefined;
    const byGoal = groupBy(entries.data, (e) => e.goalId);
    const result: GoalsData = { targets: [], habits: [] };
    for (const goal of goals.data) {
      const own = byGoal.get(goal.id) ?? [];
      if (goal.kind === 'habit') result.habits.push({ goal, entries: own, stats: computeHabitStats(goal, own, today, vacations.data) });
      else result.targets.push({ goal, entries: own, stats: computeGoalStats(goal, own, today, vacations.data) });
    }
    return result;
  }, [goals.data, entries.data, vacations.data, today]);

  return {
    data,
    today,
    isLoading: goals.isLoading || entries.isLoading || vacations.isLoading,
    error: goals.error ?? entries.error ?? vacations.error,
  };
}

/** Цель к сроку или привычка — со своей статистикой. */
export type GoalView = ({ kind: 'target' } & GoalWithStats) | ({ kind: 'habit' } & HabitWithStats);

export function useGoal(id: string) {
  const today = useToday();
  const goal = useQuery({ queryKey: keys.goal(id), queryFn: () => api.getGoal(id), retry: false });
  const entries = useQuery({ queryKey: keys.entries(id), queryFn: () => api.listEntries(id) });
  const vacations = useVacations();

  const data = useMemo<GoalView | undefined>(() => {
    if (!goal.data || !entries.data || !vacations.data) return undefined;
    const g = goal.data;
    return g.kind === 'habit'
      ? { kind: 'habit', goal: g, entries: entries.data, stats: computeHabitStats(g, entries.data, today, vacations.data) }
      : { kind: 'target', goal: g, entries: entries.data, stats: computeGoalStats(g, entries.data, today, vacations.data) };
  }, [goal.data, entries.data, vacations.data, today]);

  return {
    data,
    today,
    isLoading: goal.isLoading || entries.isLoading || vacations.isLoading,
    error: goal.error ?? entries.error ?? vacations.error,
  };
}

export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => api.createGoal(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useUpdateGoal(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: GoalPatch) => api.updateGoal(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useDeleteGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: keys.goal(id) });
      client.invalidateQueries({ queryKey: keys.goals });
      client.invalidateQueries({ queryKey: keys.entries() });
      client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useCreateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: EntryInput) => api.createEntry(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.entries() }),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEntry(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.entries() }),
  });
}

/**
 * Отметка привычки одним нажатием: `value` — записать столько за день, null — снять отметку (удалить
 * записи этого дня). На экране меняется сразу, на сервер уходит по очереди; при ошибке всё возвращается.
 */
export function useToggleHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, date, value }: { goal: HabitGoal; date: IsoDate; value: number | null }) => {
      if (value !== null) {
        await api.createEntry({ goalId: goal.id, date, value, note: '' });
        return;
      }
      // Записи берём с сервера: в кэше у только что сделанной отметки ещё временный id.
      for (const entry of await api.listEntries(goal.id)) {
        if (entry.date === date) await api.deleteEntry(entry.id);
      }
    },
    mutationKey: queues.habit,
    scope: { id: 'toggle-habit' },
    onMutate: async ({ goal, date, value }) => {
      await client.cancelQueries({ queryKey: keys.entries() });
      const change = (list: ProgressEntry[] | undefined) => {
        if (!list) return list;
        if (value === null) return list.filter((e) => !(e.goalId === goal.id && e.date === date));
        const pending = { id: `pending-${crypto.randomUUID()}`, goalId: goal.id, date, value, note: '', createdAt: new Date().toISOString() };
        return [...list, pending];
      };
      const previous = { all: client.getQueryData<ProgressEntry[]>(keys.entries()), own: client.getQueryData<ProgressEntry[]>(keys.entries(goal.id)) };
      client.setQueryData(keys.entries(), change(previous.all));
      client.setQueryData(keys.entries(goal.id), change(previous.own));
      return previous;
    },
    onError: (_error, { goal }, previous) => {
      if (previous?.all) client.setQueryData(keys.entries(), previous.all);
      if (previous?.own) client.setQueryData(keys.entries(goal.id), previous.own);
    },
    onSettled: () => {
      if (isLastInQueue(client, queues.habit)) return client.invalidateQueries({ queryKey: keys.entries() });
    },
  });
}

export function useAreas() {
  return useQuery({ queryKey: keys.areas, queryFn: () => api.listAreas() });
}

/** Сферы по id — для подписей и иконок на карточках целей. */
export function useAreaMap(): Map<string, Area> {
  const { data } = useAreas();
  return useMemo(() => new Map((data ?? []).map((area) => [area.id, area])), [data]);
}

export function useCreateArea() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AreaInput) => api.createArea(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.areas }),
  });
}

export function useUpdateArea() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AreaPatch }) => api.updateArea(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.areas }),
  });
}

export function useDeleteArea() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteArea(id),
    // Цели, материалы, задачи и проекты удалённой сферы остаются без сферы.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.areas });
      client.invalidateQueries({ queryKey: keys.goals });
      client.invalidateQueries({ queryKey: keys.materials });
      client.invalidateQueries({ queryKey: keys.tasks });
      client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

/** Импорт и сброс заменяют все данные, поэтому после них сбрасывается весь кэш. */
export function useImportData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (db: Db) => api.importData(db),
    meta: { ownErrors: true },
    onSuccess: () => client.resetQueries(),
  });
}

export function useResetData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetData(),
    onSuccess: () => client.resetQueries(),
  });
}

// ---------- нагрузка ----------

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.getSettings() });
}

/** Настройки меняются сразу, не дожидаясь сохранения: переключатели и счётчики не должны мигать. */
export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.updateSettings(patch),
    mutationKey: queues.settings,
    scope: { id: 'update-settings' },
    onMutate: (patch) => {
      const previous = client.getQueryData<Settings>(keys.settings);
      if (previous) client.setQueryData(keys.settings, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(keys.settings, context.previous);
    },
    onSuccess: (settings) => {
      if (isLastInQueue(client, queues.settings)) client.setQueryData(keys.settings, settings);
    },
  });
}

export function useVacations() {
  return useQuery({ queryKey: keys.vacations, queryFn: () => api.listVacations() });
}

export function useCreateVacation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VacationInput) => api.createVacation(input),
    meta: { ownErrors: true },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.vacations }),
  });
}

export function useDeleteVacation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteVacation(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.vacations }),
  });
}

/** Закончить отпуск сегодня: вчера — последний день, а начатый сегодня или будущий отпуск отменяется. */
export function useFinishVacation() {
  const client = useQueryClient();
  const today = useToday();
  return useMutation({
    mutationFn: async (vacation: Vacation) => {
      const action = finishVacation(vacation, today);
      if (action.kind === 'delete') await api.deleteVacation(vacation.id);
      else await api.updateVacation(vacation.id, { start: vacation.start, end: action.end });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.vacations }),
  });
}

// ---------- знания ----------

/** На сколько дней вперёд показывать прогноз нагрузки. */
export const FORECAST_DAYS = 14;

export interface Knowledge {
  materials: Material[];
  notes: NoteWithState[];
  /** Все заметки, срок которых наступил, в порядке очереди. */
  due: NoteWithState[];
  /** Очередь на сегодня с учётом бюджета, долг, отпуск. */
  load: ReviewLoad;
  forecast: ForecastDay[];
  settings: Settings;
  vacations: Vacation[];
}

export function useKnowledge() {
  const today = useToday();
  const materials = useQuery({ queryKey: keys.materials, queryFn: () => api.listMaterials() });
  const notes = useQuery({ queryKey: keys.notes, queryFn: () => api.listNotes() });
  const reviews = useQuery({ queryKey: keys.reviews, queryFn: () => api.listReviews() });
  const settings = useSettings();
  const vacations = useVacations();

  const data = useMemo<Knowledge | undefined>(() => {
    if (!materials.data || !notes.data || !reviews.data || !settings.data || !vacations.data) return undefined;
    const byNote = groupBy(reviews.data, (r) => r.noteId);
    const items = notes.data.map((note) => withState(note, byNote.get(note.id) ?? [], today, vacations.data));
    const load = planReviews(items, settings.data, today, vacations.data);
    return {
      materials: materials.data,
      notes: items,
      due: load.due,
      load,
      forecast: forecastReviews(items, {
        today,
        days: FORECAST_DAYS,
        budget: settings.data.dailyReviewLimit,
        reviewedToday: load.reviewedToday,
        vacations: vacations.data,
      }),
      settings: settings.data,
      vacations: vacations.data,
    };
  }, [materials.data, notes.data, reviews.data, settings.data, vacations.data, today]);

  return {
    data,
    today,
    isLoading: materials.isLoading || notes.isLoading || reviews.isLoading || settings.isLoading || vacations.isLoading,
    error: materials.error ?? notes.error ?? reviews.error ?? settings.error ?? vacations.error,
  };
}

/** Можно ли начать ещё один материал; `except` — материал, статус которого меняем. */
export function startCheckFor(knowledge: Knowledge, except?: string): StartCheck {
  return checkStart(knowledge.materials, knowledge.load, knowledge.settings, except);
}

export function useCreateMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MaterialInput) => api.createMaterial(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.materials }),
  });
}

export function useMaterialMap(): Map<string, Material> {
  const { data } = useQuery({ queryKey: keys.materials, queryFn: () => api.listMaterials() });
  return useMemo(() => new Map((data ?? []).map((material) => [material.id, material])), [data]);
}

export function useUpdateMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MaterialPatch }) => api.updateMaterial(id, patch),
    mutationKey: queues.material,
    scope: { id: 'update-material' },
    // Удалённые части снимаются с задач. При ошибке кэш тоже перечитывается — после правки частей наперёд.
    onSettled: () => {
      if (!isLastInQueue(client, queues.material)) return;
      client.invalidateQueries({ queryKey: keys.materials });
      client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

/**
 * Правка частей от самой свежей версии материала в кэше — как с подзадачами:
 * две быстрые правки подряд не затрут друг друга.
 */
export function useEditParts() {
  const client = useQueryClient();
  const update = useUpdateMaterial();
  const edit = async (material: Material, change: (parts: MaterialPart[]) => MaterialPart[], options?: { onSuccess?: () => void }) => {
    // Список, который как раз перечитывается, не должен затереть правку старыми данными.
    await client.cancelQueries({ queryKey: keys.materials });
    const latest = client.getQueryData<Material[]>(keys.materials)?.find((m) => m.id === material.id) ?? material;
    const parts = change(latest.parts);
    client.setQueryData<Material[]>(keys.materials, (list) => list?.map((m) => (m.id === material.id ? { ...m, parts } : m)));
    update.mutate({ id: material.id, patch: { parts } }, options);
  };
  return { edit, isPending: update.isPending };
}

export function useDeleteMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.materials });
      client.invalidateQueries({ queryKey: keys.notes });
      client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

export function useCreateNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteInput) => api.createNote(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.notes }),
  });
}

export function useUpdateNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: NotePatch }) => api.updateNote(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.notes }),
  });
}

export function useDeleteNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.notes });
      client.invalidateQueries({ queryKey: keys.reviews });
    },
  });
}

export function useCreateReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => api.createReview(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reviews }),
  });
}

export function useDeleteReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteReview(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reviews }),
  });
}

// ---------- задачи ----------

export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: () => api.listTasks() });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => api.createTask(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Галочки и правки применяются сразу, не дожидаясь сохранения; при ошибке список возвращается как был. */
export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.updateTask(id, patch),
    mutationKey: queues.task,
    scope: { id: 'update-task' },
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: keys.tasks });
      const previous = client.getQueryData<Task[]>(keys.tasks);
      if (previous) {
        const now = new Date().toISOString();
        client.setQueryData(
          keys.tasks,
          previous.map((task) => (task.id === id ? applyTaskPatch(task, patch, now) : task)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(keys.tasks, context.previous);
    },
    onSettled: () => {
      if (isLastInQueue(client, queues.task)) return client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

/**
 * Правка подзадач от самой свежей версии задачи в кэше, а не от той, что была при отрисовке:
 * иначе две быстрые правки подряд затёрли бы друг друга.
 */
export function useEditChecklist() {
  const client = useQueryClient();
  const update = useUpdateTask();
  const edit = (task: Task, change: (checklist: ChecklistItem[]) => ChecklistItem[]) => {
    const latest = client.getQueryData<Task[]>(keys.tasks)?.find((t) => t.id === task.id) ?? task;
    update.mutate({ id: task.id, patch: { checklist: change(latest.checklist) } });
  };
  return { edit, isPending: update.isPending };
}

export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Несколько задач сразу получают новый план — «перенести на завтра». */
export function usePlanTasks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, plannedDate }: { ids: string[]; plannedDate: string }) => {
      for (const id of ids) await api.updateTask(id, { plannedDate });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Запись из «Входящих» становится материалом в «Хочу изучить». */
export function useInboxToMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (task: Task) => {
      const material = await api.createMaterial({
        title: task.title,
        type: 'other',
        author: '',
        url: '',
        areaId: task.areaId,
        status: 'queued',
        parts: [],
      });
      await api.deleteTask(task.id);
      return material;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.tasks });
      client.invalidateQueries({ queryKey: keys.materials });
    },
  });
}

// ---------- проекты ----------

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: () => api.listProjects() });
}

export function useProjectMap(): Map<string, Project> {
  const { data } = useProjects();
  return useMemo(() => new Map((data ?? []).map((project) => [project.id, project])), [data]);
}

/** Задачи вместе с проектами: `inWork` — без задач проектов на паузе, завершённых и отменённых, со сроками вех и проектов. */
export function useWork() {
  const tasks = useTasks();
  const projects = useProjects();
  const data = useMemo(
    () =>
      tasks.data && projects.data
        ? { tasks: tasks.data, projects: projects.data, inWork: tasksInWork(tasks.data, projects.data) }
        : undefined,
    [tasks.data, projects.data],
  );
  return { data, isLoading: tasks.isLoading || projects.isLoading, error: tasks.error ?? projects.error };
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectInput) => api.createProject(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) => api.updateProject(id, patch),
    // Статус проекта прячет или показывает его задачи, а удалённые вехи снимаются с задач.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.projects });
      client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

export function useDeleteProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.projects });
      client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

/** Запись из «Входящих» оказалась проектом: «Подготовиться к IELTS» — это много дел, а не одно. */
export function useInboxToProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (task: Task) => {
      const project = await api.createProject({
        title: task.title,
        description: task.notes,
        areaId: task.areaId,
        goalId: null,
        status: 'active',
        deadline: task.deadline,
        milestones: [],
      });
      await api.deleteTask(task.id);
      return project;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.tasks });
      client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

// ---------- обзор недели ----------

export function useWeeklyReviews() {
  return useQuery({ queryKey: keys.weeklyReviews, queryFn: () => api.listWeeklyReviews() });
}

/** Сохранить обзор недели: в первый раз — создать, потом — изменить. */
export function useSaveWeeklyReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ existing, input }: { existing: WeeklyReview | null; input: WeeklyReviewInput }) =>
      existing
        ? api.updateWeeklyReview(existing.id, { focus: input.focus, reflection: input.reflection })
        : api.createWeeklyReview(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.weeklyReviews }),
  });
}

/**
 * Отметки в фокусе недели — как подзадачи: сразу на экране, на сервер по очереди, от самой свежей версии
 * обзора в кэше, чтобы две быстрые отметки не затёрли друг друга.
 */
export function useEditFocus() {
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: ({ id, focus }: { id: string; focus: ChecklistItem[] }) => api.updateWeeklyReview(id, { focus }),
    mutationKey: queues.weeklyReview,
    scope: { id: 'update-weekly-review' },
    onMutate: async ({ id, focus }) => {
      await client.cancelQueries({ queryKey: keys.weeklyReviews });
      const previous = client.getQueryData<WeeklyReview[]>(keys.weeklyReviews);
      if (previous) client.setQueryData(keys.weeklyReviews, previous.map((r) => (r.id === id ? { ...r, focus } : r)));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(keys.weeklyReviews, context.previous);
    },
    onSettled: () => {
      if (isLastInQueue(client, queues.weeklyReview)) return client.invalidateQueries({ queryKey: keys.weeklyReviews });
    },
  });
  const edit = (review: WeeklyReview, change: (focus: ChecklistItem[]) => ChecklistItem[]) => {
    const latest = client.getQueryData<WeeklyReview[]>(keys.weeklyReviews)?.find((r) => r.id === review.id) ?? review;
    update.mutate({ id: review.id, focus: change(latest.focus) });
  };
  return { edit, isPending: update.isPending };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { checkStart, forecastReviews, planReviews, type ForecastDay, type ReviewLoad, type StartCheck } from '../domain/load';
import { computeGoalStats, type GoalWithStats } from '../domain/progress';
import { withState, type NoteWithState } from '../domain/review';
import type {
  Area,
  AreaInput,
  AreaPatch,
  EntryInput,
  GoalInput,
  GoalPatch,
  Material,
  MaterialInput,
  MaterialPatch,
  NoteInput,
  NotePatch,
  ReviewInput,
  Settings,
  SettingsPatch,
  Vacation,
  VacationInput,
} from '../domain/types';
import { finishVacation } from '../domain/vacation';
import { todayIso } from '../lib/dates';
import { api, type Db } from '.';

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
};

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

export function useGoalsWithStats() {
  const today = useToday();
  const goals = useQuery({ queryKey: keys.goals, queryFn: () => api.listGoals() });
  const entries = useQuery({ queryKey: keys.entries(), queryFn: () => api.listEntries() });
  const vacations = useVacations();

  const data = useMemo<GoalWithStats[] | undefined>(() => {
    if (!goals.data || !entries.data || !vacations.data) return undefined;
    const byGoal = groupBy(entries.data, (e) => e.goalId);
    return goals.data.map((goal) => {
      const goalEntries = byGoal.get(goal.id) ?? [];
      return { goal, entries: goalEntries, stats: computeGoalStats(goal, goalEntries, today, vacations.data) };
    });
  }, [goals.data, entries.data, vacations.data, today]);

  return {
    data,
    today,
    isLoading: goals.isLoading || entries.isLoading || vacations.isLoading,
    error: goals.error ?? entries.error ?? vacations.error,
  };
}

export function useGoalWithStats(id: string) {
  const today = useToday();
  const goal = useQuery({ queryKey: keys.goal(id), queryFn: () => api.getGoal(id), retry: false });
  const entries = useQuery({ queryKey: keys.entries(id), queryFn: () => api.listEntries(id) });
  const vacations = useVacations();

  const data = useMemo<GoalWithStats | undefined>(() => {
    if (!goal.data || !entries.data || !vacations.data) return undefined;
    return {
      goal: goal.data,
      entries: entries.data,
      stats: computeGoalStats(goal.data, entries.data, today, vacations.data),
    };
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
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.areas });
      client.invalidateQueries({ queryKey: keys.goals });
    },
  });
}

/** Импорт и сброс заменяют все данные, поэтому после них сбрасывается весь кэш. */
export function useImportData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (db: Db) => api.importData(db),
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
    onMutate: (patch) => {
      const previous = client.getQueryData<Settings>(keys.settings);
      if (previous) client.setQueryData(keys.settings, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(keys.settings, context.previous);
    },
    onSuccess: (settings) => client.setQueryData(keys.settings, settings),
  });
}

export function useVacations() {
  return useQuery({ queryKey: keys.vacations, queryFn: () => api.listVacations() });
}

export function useCreateVacation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VacationInput) => api.createVacation(input),
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

export function useUpdateMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MaterialPatch }) => api.updateMaterial(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.materials }),
  });
}

export function useDeleteMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.materials });
      client.invalidateQueries({ queryKey: keys.notes });
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

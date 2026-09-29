import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { computeGoalStats, type GoalWithStats } from '../domain/progress';
import { compareForReview, withState, type NoteWithState } from '../domain/review';
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
} from '../domain/types';
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

  const data = useMemo<GoalWithStats[] | undefined>(() => {
    if (!goals.data || !entries.data) return undefined;
    const byGoal = groupBy(entries.data, (e) => e.goalId);
    return goals.data.map((goal) => {
      const goalEntries = byGoal.get(goal.id) ?? [];
      return { goal, entries: goalEntries, stats: computeGoalStats(goal, goalEntries, today) };
    });
  }, [goals.data, entries.data, today]);

  return {
    data,
    today,
    isLoading: goals.isLoading || entries.isLoading,
    error: goals.error ?? entries.error,
  };
}

export function useGoalWithStats(id: string) {
  const today = useToday();
  const goal = useQuery({ queryKey: keys.goal(id), queryFn: () => api.getGoal(id), retry: false });
  const entries = useQuery({ queryKey: keys.entries(id), queryFn: () => api.listEntries(id) });

  const data = useMemo<GoalWithStats | undefined>(() => {
    if (!goal.data || !entries.data) return undefined;
    return { goal: goal.data, entries: entries.data, stats: computeGoalStats(goal.data, entries.data, today) };
  }, [goal.data, entries.data, today]);

  return {
    data,
    today,
    isLoading: goal.isLoading || entries.isLoading,
    error: goal.error ?? entries.error,
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

// ---------- знания ----------

export interface Knowledge {
  materials: Material[];
  notes: NoteWithState[];
  /** Заметки к повторению сегодня, в порядке очереди. */
  due: NoteWithState[];
}

export function useKnowledge() {
  const today = useToday();
  const materials = useQuery({ queryKey: keys.materials, queryFn: () => api.listMaterials() });
  const notes = useQuery({ queryKey: keys.notes, queryFn: () => api.listNotes() });
  const reviews = useQuery({ queryKey: keys.reviews, queryFn: () => api.listReviews() });

  const data = useMemo<Knowledge | undefined>(() => {
    if (!materials.data || !notes.data || !reviews.data) return undefined;
    const byNote = groupBy(reviews.data, (r) => r.noteId);
    const items = notes.data.map((note) => withState(note, byNote.get(note.id) ?? [], today));
    return {
      materials: materials.data,
      notes: items,
      due: items.filter((item) => item.isDue).sort(compareForReview),
    };
  }, [materials.data, notes.data, reviews.data, today]);

  return {
    data,
    today,
    isLoading: materials.isLoading || notes.isLoading || reviews.isLoading,
    error: materials.error ?? notes.error ?? reviews.error,
  };
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

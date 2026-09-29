import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { computeGoalStats, type GoalWithStats } from '../domain/progress';
import type { Area, AreaInput, AreaPatch, EntryInput, GoalInput, GoalPatch, ProgressEntry } from '../domain/types';
import { todayIso } from '../lib/dates';
import { api, type Db } from '.';

const keys = {
  areas: ['areas'] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  entries: (goalId?: string) => (goalId ? (['entries', goalId] as const) : (['entries'] as const)),
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

function groupByGoal(entries: ProgressEntry[]): Map<string, ProgressEntry[]> {
  const map = new Map<string, ProgressEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.goalId);
    if (list) list.push(entry);
    else map.set(entry.goalId, [entry]);
  }
  return map;
}

export function useGoalsWithStats() {
  const today = useToday();
  const goals = useQuery({ queryKey: keys.goals, queryFn: () => api.listGoals() });
  const entries = useQuery({ queryKey: keys.entries(), queryFn: () => api.listEntries() });

  const data = useMemo<GoalWithStats[] | undefined>(() => {
    if (!goals.data || !entries.data) return undefined;
    const byGoal = groupByGoal(entries.data);
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

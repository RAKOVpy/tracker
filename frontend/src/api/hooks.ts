import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { computeGoalStats, type GoalWithStats } from '../domain/progress';
import type { EntryInput, GoalInput, GoalPatch, ProgressEntry } from '../domain/types';
import { todayIso } from '../lib/dates';
import { api } from '.';

const keys = {
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  entries: (goalId?: string) => (goalId ? (['entries', goalId] as const) : (['entries'] as const)),
};

/** Текущая дата; обновляется, если приложение открыто через полночь. */
export function useToday(): string {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayIso()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
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

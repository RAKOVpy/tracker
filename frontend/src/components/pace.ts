import { UNIT_FORMS } from '../domain/meta';
import type { GoalStats } from '../domain/progress';
import type { Goal } from '../domain/types';
import { formatShort } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';

export type Tone = 'good' | 'warn' | 'bad' | 'muted';

/** «15 стр.», «0,5 часа», «1 тренировка»: большие значения округляем до целых. */
export function formatAmount(value: number, unit: string): string {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const key = unit.toLowerCase();
  const word = key in UNIT_FORMS ? plural(rounded, UNIT_FORMS[key]) : unit;
  return `${formatNumber(rounded)} ${word}`;
}

export function describePace(goal: Goal, stats: GoalStats): { text: string; tone: Tone } {
  switch (stats.status) {
    case 'achieved':
      return { text: '🎉 Цель достигнута', tone: 'good' };
    case 'upcoming':
      return { text: `Старт ${formatShort(goal.startDate)}`, tone: 'muted' };
    case 'overdue':
      return { text: `Дедлайн прошёл, осталось ${formatAmount(stats.remaining, goal.unit)}`, tone: 'bad' };
    case 'ahead':
      return { text: `Опережаете план на ${formatAmount(stats.gap, goal.unit)}`, tone: 'good' };
    case 'on_track':
      return { text: 'Идёте по плану', tone: 'good' };
    case 'behind':
      return { text: `Отстаёте от плана на ${formatAmount(stats.gap, goal.unit)}`, tone: 'warn' };
  }
}

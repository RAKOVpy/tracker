import { isDaily, type HabitStats } from '../../domain/habits';
import type { HabitGoal } from '../../domain/types';
import { formatShort } from '../../lib/dates';
import { plural } from '../../lib/format';
import { formatAmount } from '../pace';

/** «каждый день», «3 раза в неделю». */
export function frequencyText(goal: Pick<HabitGoal, 'daysPerWeek'>): string {
  if (isDaily(goal)) return 'каждый день';
  return `${goal.daysPerWeek} ${plural(goal.daysPerWeek, ['раз', 'раза', 'раз'])} в неделю`;
}

/** «20 минут» за день; просто отметка («1 раз») не показывается. */
export function amountText(goal: Pick<HabitGoal, 'targetValue' | 'unit'>): string | null {
  if (goal.targetValue === 1 && goal.unit.trim().toLowerCase() === 'раз') return null;
  return formatAmount(goal.targetValue, goal.unit);
}

/** «каждый день · 20 минут», «3 раза в неделю». */
export function scheduleText(goal: Pick<HabitGoal, 'daysPerWeek' | 'targetValue' | 'unit'>): string {
  const amount = amountText(goal);
  return amount ? `${frequencyText(goal)} · ${amount}` : frequencyText(goal);
}

/** «12 дней подряд», «4 недели подряд». */
export function streakText(goal: Pick<HabitGoal, 'daysPerWeek'>, streak: number): string {
  const forms: [string, string, string] = isDaily(goal) ? ['день', 'дня', 'дней'] : ['неделя', 'недели', 'недель'];
  return `${streak} ${plural(streak, forms)} подряд`;
}

/** Что с привычкой сегодня — коротко, для строки. `tone` — подсветка: нужно сегодня или уже сделано. */
export function stateText(goal: HabitGoal, stats: HabitStats): { text: string; tone?: 'warn' | 'good' } | null {
  const { week, state } = stats;
  const weekText = `на неделе ${week.done} из ${week.quota}`;
  switch (state) {
    case 'upcoming':
      return { text: `начнётся ${formatShort(goal.startDate)}` };
    case 'paused':
      return { text: 'отпуск — на паузе' };
    case 'done':
      return isDaily(goal) ? null : { text: weekText, tone: week.done >= week.quota ? 'good' : undefined };
    case 'started':
      return { text: `сегодня ${formatAmount(stats.todayValue, goal.unit)} из ${formatAmount(goal.targetValue, goal.unit)}`, tone: 'warn' };
    case 'due':
      return isDaily(goal) ? null : { text: `${weekText} — нужно сегодня`, tone: 'warn' };
    case 'open':
      return { text: weekText };
    case 'rest':
      return week.quota === 0 ? { text: 'на этой неделе можно не делать' } : { text: `${weekText}, норма выполнена`, tone: 'good' };
  }
}

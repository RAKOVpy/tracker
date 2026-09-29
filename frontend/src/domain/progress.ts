import { addDays, diffDays, type IsoDate } from '../lib/dates';
import { LONG_TERM_DAYS, PRIORITIES } from './meta';
import type { Goal, ProgressEntry, Vacation } from './types';
import { isVacationDay } from './vacation';

/**
 * Статус цели относительно линейного плана «равномерно каждый день от старта до дедлайна»:
 * - upcoming — ещё не началась;
 * - achieved — целевое значение набрано;
 * - overdue  — дедлайн прошёл, цель не достигнута;
 * - ahead    — опережение плана больше чем на дневную норму;
 * - on_track — в графике (на начало дня не отстаём);
 * - behind   — отставание от плана.
 */
export type PaceStatus = 'upcoming' | 'achieved' | 'overdue' | 'ahead' | 'on_track' | 'behind';

export interface GoalStats {
  current: number;
  remaining: number;
  /** 0..100 */
  percent: number;
  /** Длительность цели в днях, включая день старта и день дедлайна. */
  totalDays: number;
  /** Сколько дней осталось, включая сегодня. 0 — дедлайн прошёл. */
  daysLeft: number;
  /** Норма в день по исходному плану (точное значение, для расчётов). */
  dailyPlan: number;
  /** Та же норма, округлённая вверх для показа: «≈ 3,4 км в день». */
  dailyNorm: number;
  /** Сколько должно быть сделано к концу сегодняшнего дня по плану. */
  expectedByToday: number;
  status: PaceStatus;
  /** Для behind — на сколько отстаём, для ahead — на сколько опережаем. Иначе 0. */
  gap: number;
  todayValue: number;
  /**
   * Сколько нужно сделать сегодня, чтобы успеть к дедлайну: остаток на начало дня,
   * поделённый на оставшиеся дни. Не меняется в течение дня, когда вносишь прогресс.
   */
  todayTarget: number;
  todayLeft: number;
  /** Дней подряд с прогрессом (если сегодня ещё не отмечено — считаем со вчера). */
  streak: number;
  isLongTerm: boolean;
  dailyTotals: Map<IsoDate, number>;
}

const EPS = 1e-9;

export function sumByDate(entries: ProgressEntry[]): Map<IsoDate, number> {
  const totals = new Map<IsoDate, number>();
  for (const entry of entries) {
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.value);
  }
  return totals;
}

/**
 * Округление нормы вверх: крупные нормы — до целых, мелкие — до десятых.
 * Округляем вверх, чтобы, выполняя норму, точно успеть к сроку.
 */
export function roundUpNorm(value: number, dailyPlan: number = value): number {
  const step = dailyPlan >= 5 ? 1 : 0.1;
  return Math.ceil(value / step - EPS) * step;
}

/** Дни подряд с прогрессом. Дни отпуска без записей серию не прерывают, но и не продлевают. */
function countStreak(totals: Map<IsoDate, number>, today: IsoDate, vacations: Vacation[]): number {
  let day = (totals.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  for (;;) {
    if ((totals.get(day) ?? 0) > 0) streak += 1;
    else if (!isVacationDay(day, vacations, today)) break;
    day = addDays(day, -1);
  }
  return streak;
}

export function computeGoalStats(goal: Goal, entries: ProgressEntry[], today: IsoDate, vacations: Vacation[] = []): GoalStats {
  const { targetValue: target, startDate, deadline } = goal;
  const dailyTotals = sumByDate(entries);

  const current = entries.reduce((sum, e) => sum + e.value, 0);
  const todayValue = dailyTotals.get(today) ?? 0;
  const before = current - todayValue;

  const totalDays = Math.max(1, diffDays(startDate, deadline) + 1);
  const dailyPlan = target / totalDays;
  const daysFromStart = diffDays(startDate, today);
  const daysPassed = Math.min(Math.max(daysFromStart, 0), totalDays);
  const daysPassedInclToday = Math.min(Math.max(daysFromStart + 1, 0), totalDays);
  const expectedAtDayStart = dailyPlan * daysPassed;
  const expectedByToday = dailyPlan * daysPassedInclToday;

  const isUpcoming = daysFromStart < 0;
  const daysLeft = isUpcoming ? totalDays : Math.max(0, diffDays(today, deadline) + 1);

  let status: PaceStatus;
  let gap = 0;
  if (current >= target - EPS) {
    status = 'achieved';
  } else if (isUpcoming) {
    status = 'upcoming';
  } else if (daysLeft === 0) {
    status = 'overdue';
    gap = target - current;
  } else if (current - expectedByToday >= dailyPlan - EPS) {
    status = 'ahead';
    gap = current - expectedByToday;
  } else if (current >= expectedAtDayStart - EPS) {
    status = 'on_track';
  } else {
    status = 'behind';
    gap = expectedAtDayStart - current;
  }

  const canWorkToday = !isUpcoming && daysLeft > 0 && before < target - EPS;
  const todayTarget = canWorkToday ? Math.min(target - before, roundUpNorm((target - before) / daysLeft, dailyPlan)) : 0;
  const todayLeft = status === 'achieved' ? 0 : Math.max(0, todayTarget - todayValue);

  return {
    current,
    remaining: Math.max(0, target - current),
    percent: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    totalDays,
    daysLeft,
    dailyPlan,
    dailyNorm: roundUpNorm(dailyPlan),
    expectedByToday,
    status,
    gap,
    todayValue,
    todayTarget,
    todayLeft: todayLeft < EPS ? 0 : todayLeft,
    streak: countStreak(dailyTotals, today, vacations),
    isLongTerm: totalDays > LONG_TERM_DAYS,
    dailyTotals,
  };
}

export interface GoalWithStats {
  goal: Goal;
  entries: ProgressEntry[];
  stats: GoalStats;
}

/** Порядок на главном экране: сначала отстающие, затем по приоритету, затем по близости дедлайна. */
export function compareForToday(a: GoalWithStats, b: GoalWithStats): number {
  const behindA = a.stats.status === 'behind' ? 0 : 1;
  const behindB = b.stats.status === 'behind' ? 0 : 1;
  if (behindA !== behindB) return behindA - behindB;
  const byPriority = PRIORITIES[a.goal.priority].rank - PRIORITIES[b.goal.priority].rank;
  if (byPriority !== 0) return byPriority;
  return a.goal.deadline.localeCompare(b.goal.deadline);
}

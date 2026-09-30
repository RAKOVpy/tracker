import { addDays, diffDays, startOfWeek, type IsoDate } from '../lib/dates';
import { PRIORITIES } from './meta';
import { sumByDate } from './progress';
import type { HabitGoal, ProgressEntry, Vacation } from './types';
import { isVacationDay } from './vacation';

/**
 * Привычка — цель вида habit: «английский 20 минут каждый день», «зал 3 раза в неделю».
 *
 * - День засчитан, когда за него записано не меньше нормы за день (targetValue).
 * - Норма недели — daysPerWeek засчитанных дней. Дни отпуска и дни до старта привычки её уменьшают
 *   пропорционально: неделя целиком в отпуске ничего не требует.
 * - Серия ежедневной привычки — в днях, у «N раз в неделю» — в неделях. У серии есть заморозка:
 *   ежедневной прощается один пропуск в неделю, недельной — один пропущенный раз за четыре недели.
 *   Отпуск серию не прерывает и не продлевает. Сегодняшний день (текущая неделя) ещё не закончился,
 *   поэтому, пока он не выполнен, серия считается со вчера (с прошлой недели).
 */

const EPS = 1e-9;

/** Выполнение смотрим за четыре недели — примерно за месяц. */
export const RATE_WEEKS = 4;
/** Ежедневная привычка: пропуски не ближе недели друг к другу серию не прерывают. */
export const DAILY_FREEZE_DAYS = 7;
/** «N раз в неделю»: неделя без одного раза прощается не чаще, чем раз в четыре недели. */
export const WEEKLY_FREEZE_WEEKS = 4;

export function isDaily(goal: Pick<HabitGoal, 'daysPerWeek'>): boolean {
  return goal.daysPerWeek >= 7;
}

export interface HabitWeek {
  /** Понедельник. */
  start: IsoDate;
  /** Засчитанные дни недели (по сегодня). */
  done: number;
  /** Сколько дней нужно за неделю с учётом отпуска и дня старта. 0 — неделя ничего не требует. */
  quota: number;
}

/**
 * Что с привычкой сегодня:
 * - upcoming — ещё не началась; paused — отпуск; done — сегодня отмечена;
 * - due — нужна сегодня: ежедневная, или недельная, которую иначе не успеть выполнить;
 * - open — недельная, можно сегодня, но не обязательно; rest — норма недели уже выполнена.
 */
export type HabitState = 'upcoming' | 'paused' | 'done' | 'due' | 'open' | 'rest';

export interface HabitStats {
  todayValue: number;
  todayDone: boolean;
  /** Сколько осталось до нормы дня: одна отметка записывает столько. */
  todayLeft: number;
  state: HabitState;
  /** Текущая неделя. */
  week: HabitWeek;
  /** Дней подряд (ежедневная) или недель подряд («N раз в неделю»). */
  streak: number;
  /** Прощённые пропуски текущей серии, от поздних к ранним: дни — у ежедневной, понедельники недель — у недельной. */
  forgiven: IsoDate[];
  /** Выполнение за последние четыре недели: засчитано из нужного; null — считать ещё не из чего. */
  rate: { done: number; total: number } | null;
  dailyTotals: Map<IsoDate, number>;
}

export interface HabitWithStats {
  goal: HabitGoal;
  entries: ProgressEntry[];
  stats: HabitStats;
}

/** Дни привычки: что засчитано, что не считается. Общая основа для статистики и календаря. */
function habitDays(goal: HabitGoal, entries: ProgressEntry[], today: IsoDate, vacations: Vacation[]) {
  const totals = sumByDate(entries);
  const isDone = (day: IsoDate) => (totals.get(day) ?? 0) >= goal.targetValue - EPS;
  const isVacation = (day: IsoDate) => isVacationDay(day, vacations, today);

  /** `through` — последний день, который учитывается в норме: у идущей недели в итогах — сегодня. */
  function week(start: IsoDate, through: IsoDate = addDays(start, 6)): HabitWeek {
    let done = 0;
    let available = 0;
    for (let day = start; day <= through && day <= addDays(start, 6); day = addDays(day, 1)) {
      if (day < goal.startDate) continue;
      if (day <= today && isDone(day)) done += 1;
      if (!isVacation(day)) available += 1;
    }
    return { start, done, quota: Math.round((goal.daysPerWeek * available) / 7) };
  }

  return { totals, isDone, isVacation, week };
}

type Days = ReturnType<typeof habitDays>;

/** Неделя привычки, начиная с понедельника `start`; `through` — норму считать только по этот день. */
export function habitWeek(item: Pick<HabitWithStats, 'goal' | 'entries'>, start: IsoDate, today: IsoDate, vacations: Vacation[] = [], through?: IsoDate): HabitWeek {
  return habitDays(item.goal, item.entries, today, vacations).week(start, through);
}

/** Недельная привычка нужна сегодня, если оставшихся дней недели (без отпуска) впритык на недостающие разы. */
function neededToday(days: Days, week: HabitWeek, today: IsoDate): boolean {
  const left = week.quota - week.done;
  if (left <= 0) return false;
  let daysLeft = 0;
  for (let day = today; day <= addDays(week.start, 6); day = addDays(day, 1)) {
    if (!days.isVacation(day)) daysLeft += 1;
  }
  return left >= daysLeft;
}

/** Пропуски, которые случились раньше первого засчитанного дня серии, — уже не её часть. */
function withinStreak(forgiven: IsoDate[], earliestSuccess: IsoDate | null): IsoDate[] {
  return earliestSuccess === null ? [] : forgiven.filter((day) => day > earliestSuccess);
}

function dailyStreak(goal: HabitGoal, days: Days, today: IsoDate): { streak: number; forgiven: IsoDate[] } {
  let streak = 0;
  let earliest: IsoDate | null = null;
  const forgiven: IsoDate[] = [];
  for (let day = days.isDone(today) ? today : addDays(today, -1); day >= goal.startDate; day = addDays(day, -1)) {
    if (days.isDone(day)) {
      streak += 1;
      earliest = day;
    } else if (days.isVacation(day)) {
      continue;
    } else if (forgiven.length === 0 || diffDays(day, forgiven[forgiven.length - 1]) >= DAILY_FREEZE_DAYS) {
      forgiven.push(day);
    } else {
      break;
    }
  }
  return { streak, forgiven: withinStreak(forgiven, earliest) };
}

function weeklyStreak(goal: HabitGoal, days: Days, current: HabitWeek): { streak: number; forgiven: IsoDate[] } {
  let streak = 0;
  let earliest: IsoDate | null = null;
  const forgiven: IsoDate[] = [];
  const first = startOfWeek(goal.startDate);
  const currentDone = current.quota > 0 && current.done >= current.quota;
  for (let start = currentDone ? current.start : addDays(current.start, -7); start >= first; start = addDays(start, -7)) {
    const week = days.week(start);
    if (week.quota === 0) continue;
    if (week.done >= week.quota) {
      streak += 1;
      earliest = start;
    } else if (
      week.quota - week.done === 1 &&
      (forgiven.length === 0 || diffDays(start, forgiven[forgiven.length - 1]) >= 7 * WEEKLY_FREEZE_WEEKS)
    ) {
      forgiven.push(start);
    } else {
      break;
    }
  }
  return { streak, forgiven: withinStreak(forgiven, earliest) };
}

/** Ежедневная: засчитанные дни за 28 дней (сегодня — если уже отмечено). Недельная: четыре прошедшие недели. */
function completionRate(goal: HabitGoal, days: Days, today: IsoDate): HabitStats['rate'] {
  let done = 0;
  let total = 0;
  if (isDaily(goal)) {
    for (let i = 0; i < RATE_WEEKS * 7; i++) {
      const day = addDays(today, -i);
      if (day < goal.startDate) break;
      const isDone = days.isDone(day);
      if (!isDone && (day === today || days.isVacation(day))) continue;
      total += 1;
      if (isDone) done += 1;
    }
  } else {
    const thisWeek = startOfWeek(today);
    for (let i = 1; i <= RATE_WEEKS; i++) {
      const start = addDays(thisWeek, -7 * i);
      if (addDays(start, 6) < goal.startDate) break;
      const week = days.week(start);
      total += week.quota;
      done += Math.min(week.done, week.quota);
    }
  }
  return total > 0 ? { done, total } : null;
}

export function computeHabitStats(goal: HabitGoal, entries: ProgressEntry[], today: IsoDate, vacations: Vacation[] = []): HabitStats {
  const days = habitDays(goal, entries, today, vacations);
  const todayValue = days.totals.get(today) ?? 0;
  const todayDone = days.isDone(today);
  const week = days.week(startOfWeek(today));

  let state: HabitState;
  if (today < goal.startDate) state = 'upcoming';
  else if (todayDone) state = 'done';
  else if (days.isVacation(today)) state = 'paused';
  else if (goal.status === 'archived') state = 'rest';
  else if (isDaily(goal) || neededToday(days, week, today)) state = 'due';
  else state = week.done >= week.quota ? 'rest' : 'open';

  const { streak, forgiven } = isDaily(goal) ? dailyStreak(goal, days, today) : weeklyStreak(goal, days, week);
  return {
    todayValue,
    todayDone,
    todayLeft: todayDone ? 0 : goal.targetValue - todayValue,
    state,
    week,
    streak,
    forgiven,
    rate: completionRate(goal, days, today),
    dailyTotals: days.totals,
  };
}

const STATE_ORDER: Record<HabitState, number> = { due: 0, open: 1, paused: 2, done: 3, rest: 4, upcoming: 5 };

/** Порядок на «Сегодня»: сначала нужные сегодня, потом «можно сегодня», сделанные — в конце; затем по приоритету. */
export function compareHabits(a: HabitWithStats, b: HabitWithStats): number {
  return (
    STATE_ORDER[a.stats.state] - STATE_ORDER[b.stats.state] ||
    PRIORITIES[a.goal.priority].rank - PRIORITIES[b.goal.priority].rank ||
    a.goal.createdAt.localeCompare(b.goal.createdAt)
  );
}

// ---------- календарь ----------

/**
 * Отметка дня в календаре: done — засчитан; partial — начат, но меньше нормы; missed — пропуск ежедневной
 * привычки; forgiven — пропуск, который простила заморозка; empty — день недельной привычки без отметки
 * (пропуском считается только неделя); vacation — отпуск; today — сегодня, ещё не отмечено; future, before —
 * после сегодня и до старта.
 */
export type DayMark = 'done' | 'partial' | 'missed' | 'forgiven' | 'empty' | 'vacation' | 'today' | 'future' | 'before';

export interface CalendarDay {
  date: IsoDate;
  mark: DayMark;
  value: number;
}

export interface CalendarWeek extends HabitWeek {
  days: CalendarDay[];
  /** Неделя недельной привычки без одного раза, которую простила заморозка. */
  forgiven: boolean;
}

/** Последние недели привычки — не больше `weeks` и не раньше недели старта; текущая — последней. */
export function habitCalendar(
  item: HabitWithStats,
  today: IsoDate,
  vacations: Vacation[] = [],
  weeks = 12,
): CalendarWeek[] {
  const { goal, entries, stats } = item;
  const days = habitDays(goal, entries, today, vacations);
  const daily = isDaily(goal);
  const forgiven = new Set(stats.forgiven);
  const thisWeek = startOfWeek(today);
  const count = Math.max(1, Math.min(weeks, diffDays(startOfWeek(goal.startDate), thisWeek) / 7 + 1));

  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * (count - 1 - i));
    const marks = Array.from({ length: 7 }, (_, d): CalendarDay => {
      const date = addDays(start, d);
      const value = days.totals.get(date) ?? 0;
      let mark: DayMark;
      if (date < goal.startDate) mark = 'before';
      else if (days.isDone(date)) mark = 'done';
      else if (date > today) mark = days.isVacation(date) ? 'vacation' : 'future';
      else if (value > 0) mark = 'partial';
      else if (days.isVacation(date)) mark = 'vacation';
      else if (date === today) mark = 'today';
      else if (!daily) mark = 'empty';
      else mark = forgiven.has(date) ? 'forgiven' : 'missed';
      return { date, mark, value };
    });
    return { ...days.week(start), days: marks, forgiven: !daily && forgiven.has(start) };
  });
}

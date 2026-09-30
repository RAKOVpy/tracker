import { addDays, addMonths, diffDays, formatDayMonth, monthsBetween, weekdayIndex, type IsoDate } from '../lib/dates';
import { plural } from '../lib/format';
import type { Recurrence, RepeatUnit, Task } from './types';

/**
 * Повторяющиеся задачи. Каждый повтор — обычная задача: закрыли её — появилась следующая
 * с датами на следующий повтор, а сделанная осталась в истории и в итоге дня.
 *
 * Повторы идут по расписанию от `start`: «каждое вс» остаётся воскресеньем, даже если один раз
 * задачу перенесли на понедельник или сделали с опозданием. Следующий повтор — всегда после
 * сегодняшнего дня и после даты текущего: просроченная ежедневная задача не порождает
 * цепочку просроченных копий.
 */

export const REPEAT_INTERVAL_MAX = 99;

export const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WEEKDAY_EVERY = [
  'каждый понедельник',
  'каждый вторник',
  'каждую среду',
  'каждый четверг',
  'каждую пятницу',
  'каждую субботу',
  'каждое воскресенье',
];

export const REPEAT_UNITS: Record<RepeatUnit, string> = {
  day: 'Каждый день',
  week: 'Каждую неделю',
  month: 'Каждый месяц',
  year: 'Каждый год',
};

export const REPEAT_UNIT_ORDER: RepeatUnit[] = ['day', 'week', 'month', 'year'];

/** Шаг по месяцам для месячного и годового повтора. */
const monthStep = (rule: Recurrence) => (rule.unit === 'year' ? 12 : 1) * rule.interval;

/** Понедельник недели, в которую попадает дата. */
const weekStart = (date: IsoDate) => addDays(date, -weekdayIndex(date));

/** Попадает ли дата в расписание. */
export function isOccurrence(rule: Recurrence, date: IsoDate): boolean {
  if (date < rule.start) return false;
  switch (rule.unit) {
    case 'day':
      return diffDays(rule.start, date) % rule.interval === 0;
    case 'week':
      return (
        rule.weekdays.includes(weekdayIndex(date)) &&
        (diffDays(weekStart(rule.start), weekStart(date)) / 7) % rule.interval === 0
      );
    case 'month':
    case 'year': {
      const months = monthsBetween(rule.start, date);
      return months % monthStep(rule) === 0 && addMonths(rule.start, months) === date;
    }
  }
}

/** Ближайший повтор строго после даты. */
export function nextOccurrence(rule: Recurrence, after: IsoDate): IsoDate {
  const from = addDays(after, 1) > rule.start ? addDays(after, 1) : rule.start;
  switch (rule.unit) {
    case 'day':
      return addDays(rule.start, Math.ceil(diffDays(rule.start, from) / rule.interval) * rule.interval);
    case 'week': {
      // В любом окне из interval недель есть «своя» неделя, а в ней — нужный день.
      for (let day = from, i = 0; i < 7 * (rule.interval + 1); day = addDays(day, 1), i++) {
        if (isOccurrence(rule, day)) return day;
      }
      throw new Error('В недельном повторе не выбраны дни');
    }
    case 'month':
    case 'year': {
      const step = monthStep(rule);
      let months = Math.ceil(monthsBetween(rule.start, from) / step) * step;
      while (addMonths(rule.start, months) < from) months += step;
      return addMonths(rule.start, months);
    }
  }
}

/** Первый повтор в этот день или позже. */
export function firstOccurrence(rule: Recurrence, from: IsoDate): IsoDate {
  return nextOccurrence(rule, addDays(from, -1));
}

/** Последний повтор в этот день или раньше; null — расписание ещё не началось. */
export function occurrenceOnOrBefore(rule: Recurrence, date: IsoDate): IsoDate | null {
  if (date < rule.start) return null;
  switch (rule.unit) {
    case 'day':
      return addDays(rule.start, Math.floor(diffDays(rule.start, date) / rule.interval) * rule.interval);
    case 'week': {
      for (let day = date, i = 0; i < 7 * (rule.interval + 1) && day >= rule.start; day = addDays(day, -1), i++) {
        if (isOccurrence(rule, day)) return day;
      }
      return null;
    }
    case 'month':
    case 'year': {
      const step = monthStep(rule);
      let months = Math.floor(monthsBetween(rule.start, date) / step) * step;
      while (months >= 0 && addMonths(rule.start, months) > date) months -= step;
      return months >= 0 ? addMonths(rule.start, months) : null;
    }
  }
}

/** Правило в каноническом виде: целый шаг в пределах, дни недели только у недельного повтора, без повторов. */
export function normalizeRecurrence(rule: Recurrence): Recurrence {
  const interval = Math.min(REPEAT_INTERVAL_MAX, Math.max(1, Math.round(rule.interval) || 1));
  const days = [...new Set(rule.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  return {
    unit: rule.unit,
    interval,
    weekdays: rule.unit === 'week' ? (days.length > 0 ? days : [weekdayIndex(rule.start)]) : [],
    start: rule.start,
  };
}

/** «пн», «пн и чт», «пн, ср и пт». */
function listDays(days: number[]): string {
  const names = days.map((d) => WEEKDAY_SHORT[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

/** «каждое воскресенье», «по будням», «каждые 2 недели по пн и чт», «каждый месяц, 10-го». */
export function describeRecurrence(rule: Recurrence): string {
  const n = rule.interval;
  switch (rule.unit) {
    case 'day':
      return n === 1 ? 'каждый день' : `${plural(n, ['каждый', 'каждые', 'каждые'])} ${n} ${plural(n, ['день', 'дня', 'дней'])}`;
    case 'week': {
      const days = rule.weekdays;
      if (n === 1) {
        if (days.length === 7) return 'каждый день';
        if (days.join() === '0,1,2,3,4') return 'по будням';
        if (days.join() === '5,6') return 'по выходным';
        return days.length === 1 ? WEEKDAY_EVERY[days[0]] : `по ${listDays(days)}`;
      }
      return `${plural(n, ['каждую', 'каждые', 'каждые'])} ${n} ${plural(n, ['неделю', 'недели', 'недель'])} по ${listDays(days)}`;
    }
    case 'month': {
      const day = `${Number(rule.start.slice(8))}-го`;
      if (n === 1) return `каждый месяц, ${day}`;
      return `${plural(n, ['каждый', 'каждые', 'каждые'])} ${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])}, ${day}`;
    }
    case 'year': {
      const day = formatDayMonth(rule.start);
      if (n === 1) return `каждый год, ${day}`;
      return `${plural(n, ['каждый', 'каждые', 'каждые'])} ${n} ${plural(n, ['год', 'года', 'лет'])}, ${day}`;
    }
  }
}

/** Дата, по которой задача встаёт в расписание: когда делаю, а без неё — дедлайн. */
export function repeatAnchor(task: Pick<Task, 'plannedDate' | 'deadline'>): IsoDate | null {
  return task.plannedDate ?? task.deadline;
}

/**
 * Повтор для новой или изменённой задачи: отсчёт идёт от её даты (когда делаю, иначе дедлайн).
 * Задача без дат встаёт на первый повтор начиная с сегодня: «каждое вс» — на ближайшее воскресенье.
 */
export function anchorRecurrence(
  rule: Recurrence,
  dates: Pick<Task, 'plannedDate' | 'deadline'>,
  today: IsoDate,
): { recurrence: Recurrence; plannedDate: IsoDate | null; deadline: IsoDate | null } {
  const anchor = repeatAnchor(dates);
  if (anchor) return { recurrence: normalizeRecurrence({ ...rule, start: anchor }), plannedDate: dates.plannedDate, deadline: dates.deadline };
  const draft = normalizeRecurrence({ ...rule, start: today });
  const first = firstOccurrence(draft, today);
  return { recurrence: { ...draft, start: first }, plannedDate: first, deadline: null };
}

/** Одно и то же правило, без учёта начала отсчёта. */
export function sameRule(a: Recurrence | null, b: Recurrence | null): boolean {
  if (a === null || b === null) return a === b;
  return a.unit === b.unit && a.interval === b.interval && a.weekdays.join() === b.weekdays.join();
}

/**
 * Следующий повтор закрытой задачи. Дата «когда делаю» (или дедлайн, если плана нет) встаёт
 * на следующий повтор; дедлайн при плане сдвигается на столько же, сколько повтор по расписанию,
 * — разрыв «сажусь в вс, сдать до пн» сохраняется. Подзадачи снова не отмечены.
 */
export function nextInstance(task: Task, today: IsoDate, ctx: { id: string; now: string }): Task {
  const rule = task.recurrence!;
  const anchor = repeatAnchor(task) ?? rule.start;
  // Повтор, к которому относится задача: её могли перенести с вс на вт, но это повтор воскресенья.
  const current = occurrenceOnOrBefore(rule, anchor) ?? anchor;
  const next = nextOccurrence(rule, anchor > today ? anchor : today);
  const shift = diffDays(current, next);
  const hasPlan = task.plannedDate !== null || task.deadline === null;
  return {
    ...task,
    id: ctx.id,
    status: 'todo',
    plannedDate: hasPlan ? next : null,
    deadline: task.deadline === null ? null : hasPlan ? addDays(task.deadline, shift) : next,
    checklist: task.checklist.map((item) => ({ ...item, done: false })),
    repeatOf: task.id,
    completedAt: null,
    createdAt: ctx.now,
  };
}

/**
 * Прошлые повторы задачи, от недавних к старым: цепочка по `repeatOf`.
 * Удалённый повтор обрывает цепочку.
 */
export function previousRepeats(task: Task, tasks: Task[], limit: number): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result: Task[] = [];
  const seen = new Set([task.id]);
  let prev = task.repeatOf ? byId.get(task.repeatOf) : undefined;
  while (prev && result.length < limit && !seen.has(prev.id)) {
    result.push(prev);
    seen.add(prev.id);
    prev = prev.repeatOf ? byId.get(prev.repeatOf) : undefined;
  }
  return result;
}

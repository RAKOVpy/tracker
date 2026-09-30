import { addDays, formatShort, startOfWeek, weekdayIndex, type IsoDate } from '../lib/dates';
import { habitWeek, type HabitWithStats } from './habits';
import type { GoalWithStats } from './progress';
import { isReadyToFinish, isStalled } from './projects';
import { completedOn } from './tasks';
import type { ChecklistItem, Project, Review, Task, Vacation, WeeklyReview } from './types';

/**
 * Обзор недели — десять минут раз в неделю: разобрать входящие, посмотреть, где отстают цели
 * и привычки, проверить повторения и долг, выбрать фокус на следующую неделю и записать, что
 * получилось и что мешало. Подводится неделя с понедельника по воскресенье: с пятницы по воскресенье —
 * текущая, с понедельника по четверг — прошлая (обзор, пропущенный в выходные, можно сделать в начале недели).
 */

/** Сколько главных дел можно выбрать в фокус недели. */
export const FOCUS_LIMIT = 3;

/** Какую неделю подводить сегодня (понедельник). */
export function reviewWeekFor(today: IsoDate): IsoDate {
  const monday = startOfWeek(today);
  return weekdayIndex(today) >= 4 ? monday : addDays(monday, -7);
}

/** Неделя, на которую выбирают фокус в обзоре недели `weekStart`, — следующая за ней. */
export function focusWeekOf(weekStart: IsoDate): IsoDate {
  return addDays(weekStart, 7);
}

/** Обзор, в котором выбран фокус на текущую неделю. */
export function currentFocus(reviews: WeeklyReview[], today: IsoDate): WeeklyReview | null {
  const previousWeek = addDays(startOfWeek(today), -7);
  return reviews.find((r) => r.weekStart === previousWeek) ?? null;
}

/**
 * Напомнить на «Сегодня» об обзоре: с пятницы по понедельник, пока неделю не подвели.
 * Со вторника по четверг не напоминаем: обзор прошлой недели по-прежнему открыт в разделе «Неделя».
 */
export function reviewReminder(reviews: WeeklyReview[], today: IsoDate): IsoDate | null {
  const weekday = weekdayIndex(today);
  if (weekday >= 1 && weekday <= 3) return null;
  const week = reviewWeekFor(today);
  return reviews.some((r) => r.weekStart === week) ? null : week;
}

export interface WeekResults {
  /** Задач сделано за неделю. */
  tasksDone: number;
  /** Повторений заметок за неделю. */
  reviews: number;
  /** Привычки: засчитано дней из нужных (у идущей недели — по сегодня); null — привычек нет. */
  habits: { done: number; total: number } | null;
  /** Фокус, выбранный на эту неделю в прошлом обзоре; null — обзора не было. */
  focus: ChecklistItem[] | null;
}

export function weekResults(input: {
  weekStart: IsoDate;
  today: IsoDate;
  tasks: Task[];
  reviews: Review[];
  habits: HabitWithStats[];
  weeklyReviews: WeeklyReview[];
  vacations: Vacation[];
}): WeekResults {
  const { weekStart, today } = input;
  const end = addDays(weekStart, 6);
  const through = end < today ? end : today;
  const inWeek = (day: IsoDate | null) => day !== null && day >= weekStart && day <= end;

  let done = 0;
  let total = 0;
  for (const habit of input.habits) {
    if (habit.goal.status !== 'active') continue;
    const week = habitWeek(habit, weekStart, today, input.vacations, through);
    total += week.quota;
    done += Math.min(week.done, week.quota);
  }
  const previous = input.weeklyReviews.find((r) => focusWeekOf(r.weekStart) === weekStart);
  return {
    tasksDone: input.tasks.filter((t) => t.status === 'done' && inWeek(completedOn(t))).length,
    reviews: input.reviews.filter((r) => inWeek(r.date)).length,
    habits: total > 0 ? { done, total } : null,
    focus: previous ? previous.focus : null,
  };
}

export interface FocusSuggestion {
  text: string;
  /** Почему предлагаем: «важно, срок 9 окт», «цель отстаёт от плана». */
  why: string;
}

/**
 * Подсказки для фокуса на следующую неделю: несделанный фокус этой недели, важные задачи со сроком
 * до конца следующей недели, отстающие цели, проекты без следующего шага и привычки, которые не выполнялись.
 */
export function focusSuggestions(input: {
  weekStart: IsoDate;
  today: IsoDate;
  /** Фокус подводимой недели (из прошлого обзора). */
  focus: ChecklistItem[] | null;
  /** Задачи в работе — без задач проектов на паузе. */
  tasks: Task[];
  projects: Project[];
  goals: GoalWithStats[];
  habits: HabitWithStats[];
  vacations: Vacation[];
}): FocusSuggestion[] {
  const { weekStart, today } = input;
  const focusEnd = addDays(focusWeekOf(weekStart), 6);
  const result: FocusSuggestion[] = [];
  const add = (text: string, why: string) => {
    if (!result.some((s) => s.text.toLowerCase() === text.toLowerCase())) result.push({ text, why });
  };

  for (const item of input.focus ?? []) if (!item.done) add(item.text, 'не сделано из фокуса этой недели');

  const soon = (date: IsoDate | null) => date !== null && date <= focusEnd;
  input.tasks
    .filter((t) => t.status === 'todo' && t.important && (soon(t.deadline) || soon(t.plannedDate)))
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.createdAt.localeCompare(b.createdAt))
    .forEach((t) => add(t.title, t.deadline ? `важно, срок ${formatShort(t.deadline)}` : 'важная задача'));

  for (const { goal, stats } of input.goals) {
    if (goal.status !== 'active') continue;
    if (stats.status === 'behind') add(goal.title, 'цель отстаёт от плана');
    if (stats.status === 'overdue') add(goal.title, 'срок цели прошёл');
  }

  for (const project of input.projects) {
    const tasks = input.tasks.filter((t) => t.projectId === project.id);
    if (isStalled(project, tasks) && !isReadyToFinish(project, tasks)) add(project.title, 'у проекта нет следующего шага');
  }

  const end = addDays(weekStart, 6);
  for (const habit of input.habits) {
    if (habit.goal.status !== 'active') continue;
    const week = habitWeek(habit, weekStart, today, input.vacations, end < today ? end : today);
    if (week.quota > 0 && week.done < week.quota) add(habit.goal.title, `привычка: ${week.done} из ${week.quota} за неделю`);
  }
  return result;
}

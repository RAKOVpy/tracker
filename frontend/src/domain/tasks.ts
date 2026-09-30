import { diffDays, todayIso, type IsoDate } from '../lib/dates';
import type { Task, TaskInput, TaskPatch } from './types';

/**
 * Задачи. Важность ставится вручную, срочность считается из дедлайна. Дедлайн («сдать до пятницы»)
 * и дата «когда делаю» («сяду в среду») — разные поля: план можно сдвинуть, не трогая срок,
 * и просроченной считается только задача с прошедшим дедлайном, а не с прошедшим планом.
 */

/** Задача срочная, если до дедлайна не больше стольких дней: сегодня, завтра или послезавтра. */
export const URGENT_DAYS = 2;

export function isUrgent(task: Pick<Task, 'deadline'>, today: IsoDate): boolean {
  return task.deadline !== null && diffDays(today, task.deadline) <= URGENT_DAYS;
}

export function isOverdue(task: Pick<Task, 'deadline'>, today: IsoDate): boolean {
  return task.deadline !== null && task.deadline < today;
}

export type TaskBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday';

export const BUCKET_TITLES: Record<TaskBucket, string> = {
  overdue: 'Срок прошёл',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На неделе',
  later: 'Позже',
  someday: 'Без даты',
};

export const BUCKET_ORDER: TaskBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday'];

/**
 * Когда делать открытую задачу:
 * - дедлайн прошёл — «срок прошёл»;
 * - план на сегодня или раньше (вчера не успел), либо дедлайн сегодня — «сегодня»;
 * - срочная задача, которую не запланировали до дедлайна, — тоже «сегодня», иначе она всплывёт
 *   в последний момент;
 * - иначе по ближайшей из двух дат: завтра, на неделе, позже; без дат — «без даты».
 */
export function taskBucket(task: Pick<Task, 'deadline' | 'plannedDate'>, today: IsoDate): TaskBucket {
  const { deadline, plannedDate } = task;
  if (deadline !== null && deadline < today) return 'overdue';
  if ((plannedDate !== null && plannedDate <= today) || deadline === today) return 'today';
  if (deadline !== null && isUrgent(task, today) && (plannedDate === null || plannedDate > deadline)) return 'today';
  const dates = [plannedDate, deadline].filter((d): d is IsoDate => d !== null).sort();
  if (dates.length === 0) return 'someday';
  const days = diffDays(today, dates[0]);
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

/** Задача на экране «Сегодня»: открытая, с прошедшим сроком или на сегодня. */
export function isForToday(task: Task, today: IsoDate): boolean {
  if (task.status !== 'todo') return false;
  const bucket = taskBucket(task, today);
  return bucket === 'overdue' || bucket === 'today';
}

/** План был на прошлый день, а задача не сделана: «перенесено с пн». */
export function carriedFrom(task: Pick<Task, 'plannedDate'>, today: IsoDate): IsoDate | null {
  return task.plannedDate !== null && task.plannedDate < today ? task.plannedDate : null;
}

/** День, когда задачу сделали или отменили, — по часам пользователя. */
export function completedOn(task: Pick<Task, 'completedAt'>): IsoDate | null {
  return task.completedAt ? todayIso(new Date(task.completedAt)) : null;
}

/** Порядок в списке: сначала с прошедшим сроком, затем важные, затем по дедлайну и плану. */
export function compareTasks(a: Task, b: Task, today: IsoDate): number {
  const byDate = (x: IsoDate | null, y: IsoDate | null) => (x ?? '9999').localeCompare(y ?? '9999');
  return (
    Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
    Number(b.important) - Number(a.important) ||
    byDate(a.deadline, b.deadline) ||
    byDate(a.plannedDate, b.plannedDate) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** Матрица Эйзенхауэра: важность ручная, срочность из дедлайна. */
export type Quadrant = 'do' | 'plan' | 'quick' | 'later';

export const QUADRANTS: Record<Quadrant, { title: string; hint: string }> = {
  do: { title: 'Важно и срочно', hint: 'Сделать в первую очередь.' },
  plan: { title: 'Важно, не срочно', hint: 'Запланировать день: здесь двигаются цели.' },
  quick: { title: 'Срочно, не важно', hint: 'Сделать быстро или поручить.' },
  later: { title: 'Не важно и не срочно', hint: 'Может, это и не нужно?' },
};

export const QUADRANT_ORDER: Quadrant[] = ['do', 'plan', 'quick', 'later'];

export function quadrant(task: Pick<Task, 'important' | 'deadline'>, today: IsoDate): Quadrant {
  const urgent = isUrgent(task, today);
  if (task.important) return urgent ? 'do' : 'plan';
  return urgent ? 'quick' : 'later';
}

export function checklistProgress(task: Pick<Task, 'checklist'>): { done: number; total: number } {
  return { done: task.checklist.filter((item) => item.done).length, total: task.checklist.length };
}

const isClosed = (status: Task['status']) => status === 'done' || status === 'cancelled';

/** Новая задача: всё, что не указано, — по умолчанию (открытая, без дат, сферы и проекта). */
export function taskInput(fields: Partial<TaskInput> & Pick<TaskInput, 'title'>): TaskInput {
  return {
    notes: '',
    status: 'todo',
    important: false,
    deadline: null,
    plannedDate: null,
    areaId: null,
    projectId: null,
    milestoneId: null,
    checklist: [],
    ...fields,
  };
}

export function createTask(input: TaskInput, ctx: { id: string; now: string }): Task {
  return {
    ...input,
    milestoneId: input.projectId === null ? null : input.milestoneId,
    id: ctx.id,
    completedAt: isClosed(input.status) ? ctx.now : null,
    createdAt: ctx.now,
  };
}

/**
 * Изменение задачи: при закрытии запоминается время, при возврате в работу — сбрасывается.
 * Задача, перенесённая в другой проект или убранная из проекта, теряет веху старого проекта.
 */
export function applyTaskPatch(task: Task, patch: TaskPatch, now: string): Task {
  const next: Task = { ...task, ...patch };
  if (next.projectId === null || (patch.projectId !== undefined && patch.projectId !== task.projectId && patch.milestoneId === undefined)) {
    next.milestoneId = null;
  }
  if (patch.status !== undefined && isClosed(patch.status) !== isClosed(task.status)) {
    next.completedAt = isClosed(patch.status) ? now : null;
  }
  return next;
}

/**
 * «Перенести на завтра» вечером: открытые задачи на сегодня получают план на завтра.
 * Задачи с дедлайном сегодня или раньше не переносятся — перенос не отменит срок.
 */
export function postponeCandidates(tasks: Task[], today: IsoDate): Task[] {
  return tasks.filter((t) => t.status === 'todo' && taskBucket(t, today) === 'today' && (t.deadline === null || t.deadline > today));
}

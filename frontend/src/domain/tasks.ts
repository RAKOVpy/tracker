import { diffDays, todayIso, type IsoDate } from '../lib/dates';
import { nextInstance } from './recurrence';
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

export const isClosed = (status: Task['status']) => status === 'done' || status === 'cancelled';

/** Новая задача: всё, что не указано, — по умолчанию (открытая, разовая, без дат, сферы, проекта и материала). */
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
    materialId: null,
    partId: null,
    checklist: [],
    recurrence: null,
    ...fields,
  };
}

export function createTask(input: TaskInput, ctx: { id: string; now: string }): Task {
  return {
    ...input,
    milestoneId: input.projectId === null ? null : input.milestoneId,
    partId: input.materialId === null ? null : input.partId,
    repeatOf: null,
    id: ctx.id,
    completedAt: isClosed(input.status) ? ctx.now : null,
    createdAt: ctx.now,
  };
}

/** Сменили родителя (проект, материал) и не указали новую вложенную ссылку — старая к нему не относится. */
function parentChanged<K extends keyof TaskPatch>(task: Task, patch: TaskPatch, parent: K, child: keyof TaskPatch): boolean {
  return patch[parent] !== undefined && patch[parent] !== task[parent] && patch[child] === undefined;
}

/**
 * Изменение задачи: при закрытии запоминается время, при возврате в работу — сбрасывается.
 * Задача, перенесённая в другой проект или убранная из проекта, теряет веху старого проекта;
 * так же с материалом и его частью.
 */
export function applyTaskPatch(task: Task, patch: TaskPatch, now: string): Task {
  const next: Task = { ...task, ...patch };
  if (next.projectId === null || parentChanged(task, patch, 'projectId', 'milestoneId')) next.milestoneId = null;
  if (next.materialId === null || parentChanged(task, patch, 'materialId', 'partId')) next.partId = null;
  if (patch.status !== undefined && isClosed(patch.status) !== isClosed(task.status)) {
    next.completedAt = isClosed(patch.status) ? now : null;
  }
  return next;
}

/** Следующий повтор не трогали: открыт, те же название и заметки, подзадачи не отмечены. */
function untouchedRepeat(next: Task, task: Task): boolean {
  return (
    next.status === 'todo' && next.title === task.title && next.notes === task.notes && next.checklist.every((item) => !item.done)
  );
}

/**
 * Изменение задачи вместе с её повторами:
 * - закрыли повторяющуюся задачу (сделали или пропустили) — появляется следующий повтор;
 * - вернули в работу — следующий повтор убирается, если его ещё не трогали, и серия продолжается
 *   этой задачей; если трогали, серию продолжает он, а эта задача становится разовой.
 */
export function applyTaskUpdate(
  tasks: Task[],
  id: string,
  patch: TaskPatch,
  ctx: { now: string; today: IsoDate; newId: () => string },
): Task[] {
  const before = tasks.find((t) => t.id === id);
  if (!before) return tasks;
  const task = applyTaskPatch(before, patch, ctx.now);
  let result = tasks.map((t) => (t.id === id ? task : t));
  const next = result.find((t) => t.repeatOf === id);

  if (task.recurrence && isClosed(task.status) && !isClosed(before.status) && !next) {
    result.push(nextInstance(task, ctx.today, { id: ctx.newId(), now: ctx.now }));
  } else if (task.recurrence && !isClosed(task.status) && isClosed(before.status) && next) {
    result = untouchedRepeat(next, task)
      ? result.filter((t) => t.id !== next.id)
      : result.map((t) => (t.id === id ? { ...t, recurrence: null } : t));
  }
  return result;
}

/**
 * «Перенести на завтра» вечером: открытые задачи на сегодня получают план на завтра.
 * Задачи с дедлайном сегодня или раньше не переносятся — перенос не отменит срок.
 */
export function postponeCandidates(tasks: Task[], today: IsoDate): Task[] {
  return tasks.filter((t) => t.status === 'todo' && taskBucket(t, today) === 'today' && (t.deadline === null || t.deadline > today));
}

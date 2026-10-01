import type { IsoDate } from '../lib/dates';
import { compareTasks, isOverdue } from './tasks';
import type { Milestone, Project, ProjectInput, ProjectPatch, ProjectStatus, Task } from './types';

/**
 * Проекты. Прогресс, следующий шаг и готовность вех не хранятся, а вычисляются из задач.
 * Задачи проектов на паузе, завершённых и отменённых не попадают в «Сегодня» и список задач:
 * проект отложили — отложили и его дела. Срок вехи и проекта действует на их задачи без своего срока.
 */

export const PROJECT_STATUSES: Record<ProjectStatus, string> = {
  active: 'В работе',
  paused: 'На паузе',
  done: 'Завершён',
  dropped: 'Отменён',
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['active', 'paused', 'done', 'dropped'];

const isClosedStatus = (status: ProjectStatus) => status === 'done' || status === 'dropped';
const isOpenTask = (task: Task) => task.status === 'todo' || task.status === 'inbox';

/** Чей срок у задачи, если своего у неё нет. */
export type DeadlineSource = 'milestone' | 'project';

/** Задача в работе: `deadline` — срок с учётом вехи и проекта, `deadlineFrom` — чей он; null — свой. */
export type WorkTask = Task & { deadlineFrom: DeadlineSource | null };

/**
 * Срок задачи: свой, а если его нет — срок вехи, у вехи без срока — срок проекта. Задачу вехи со сроком
 * «сегодня» нужно сделать сегодня, даже если своего срока у неё нет, — иначе она не попадёт в «Сегодня».
 * Свой срок важнее: его поставили этой задаче нарочно.
 */
export function workTask(task: Task, project: Project | undefined): WorkTask {
  if (task.deadline !== null || !project) return { ...task, deadlineFrom: null };
  const milestone = project.milestones.find((m) => m.id === task.milestoneId);
  if (milestone?.deadline) return { ...task, deadline: milestone.deadline, deadlineFrom: 'milestone' };
  if (project.deadline) return { ...task, deadline: project.deadline, deadlineFrom: 'project' };
  return { ...task, deadlineFrom: null };
}

/**
 * Задачи в работе: без проекта или из проекта в работе, со сроками вех и проектов.
 * Проект, которого нет, не прячет задачу.
 */
export function tasksInWork(tasks: Task[], projects: Project[]): WorkTask[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return tasks.flatMap((t) => {
    const project = t.projectId === null ? undefined : byId.get(t.projectId);
    return project && project.status !== 'active' ? [] : [workTask(t, project)];
  });
}

export interface ProjectProgress {
  done: number;
  /** Все задачи, кроме отменённых. */
  total: number;
  open: number;
}

export function projectProgress(tasks: Task[]): ProjectProgress {
  const counted = tasks.filter((t) => t.status !== 'cancelled');
  return {
    done: counted.filter((t) => t.status === 'done').length,
    total: counted.length,
    open: counted.filter(isOpenTask).length,
  };
}

/**
 * Порядок задач в проекте: сначала с прошедшим сроком, затем по вехам (задачи без вехи — после вех),
 * внутри вехи — как в списке задач.
 */
export function compareProjectTasks(project: Project, today: IsoDate): (a: Task, b: Task) => number {
  const order = new Map(project.milestones.map((m, i) => [m.id, i]));
  const index = (t: Task) => (t.milestoneId !== null ? (order.get(t.milestoneId) ?? project.milestones.length) : project.milestones.length);
  return (a, b) =>
    Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || index(a) - index(b) || compareTasks(a, b, today);
}

/** Следующий шаг — первая открытая задача проекта. Без него проект стоит на месте. */
export function nextStep(project: Project, tasks: Task[], today: IsoDate): Task | null {
  return tasks.filter((t) => t.status === 'todo').sort(compareProjectTasks(project, today))[0] ?? null;
}

export interface MilestoneState {
  done: number;
  total: number;
  /** Все задачи вехи закрыты и хотя бы одна сделана. */
  completed: boolean;
  /** Срок вехи прошёл, а она не готова. */
  overdue: boolean;
}

export function milestoneState(milestone: Milestone, tasks: Task[], today: IsoDate): MilestoneState {
  const own = tasks.filter((t) => t.milestoneId === milestone.id && t.status !== 'cancelled');
  const done = own.filter((t) => t.status === 'done').length;
  const completed = own.length > 0 && done === own.length;
  return { done, total: own.length, completed, overdue: !completed && milestone.deadline !== null && milestone.deadline < today };
}

/**
 * Вехи по срокам: вехи со сроком встают по датам (с одинаковой датой — в прежнем порядке),
 * вехи без срока остаются на своих местах — их место в плане знает только человек.
 */
export function sortMilestonesByDeadline(milestones: Milestone[]): Milestone[] {
  const dated = milestones.filter((m) => m.deadline !== null).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  let next = 0;
  return milestones.map((m) => (m.deadline === null ? m : dated[next++]));
}

/** Вехи со сроком идут по датам — расставлять нечего. */
export function milestonesInDeadlineOrder(milestones: Milestone[]): boolean {
  const dates = milestones.flatMap((m) => (m.deadline === null ? [] : [m.deadline]));
  return dates.every((date, i) => i === 0 || dates[i - 1] <= date);
}

/** Веха `index` на `shift` позиций выше (−1) или ниже (+1); за край списка не уходит. */
export function moveMilestone(milestones: Milestone[], index: number, shift: -1 | 1): Milestone[] {
  const target = index + shift;
  if (target < 0 || target >= milestones.length) return milestones;
  const next = [...milestones];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Первая неготовая веха (номер с единицы); `done` — все вехи пройдены; null — вех нет. */
export function currentMilestone(project: Project, tasks: Task[], today: IsoDate): { number: number; milestone: Milestone } | 'done' | null {
  if (project.milestones.length === 0) return null;
  const index = project.milestones.findIndex((m) => !milestoneState(m, tasks, today).completed);
  return index === -1 ? 'done' : { number: index + 1, milestone: project.milestones[index] };
}

/** Проект в работе без открытых задач: непонятно, что делать дальше. */
export function isStalled(project: Project, tasks: Task[]): boolean {
  return project.status === 'active' && !tasks.some((t) => t.status === 'todo');
}

/** Все задачи сделаны — можно завершать. */
export function isReadyToFinish(project: Project, tasks: Task[]): boolean {
  const progress = projectProgress(tasks);
  return project.status === 'active' && progress.total > 0 && progress.open === 0;
}

export function createProject(input: ProjectInput, ctx: { id: string; now: string }): Project {
  return { ...input, id: ctx.id, completedAt: isClosedStatus(input.status) ? ctx.now : null, createdAt: ctx.now };
}

/** Изменение проекта: при завершении запоминается время, при возврате в работу — сбрасывается. */
export function applyProjectPatch(project: Project, patch: ProjectPatch, now: string): Project {
  const next: Project = { ...project, ...patch };
  if (patch.status !== undefined && isClosedStatus(patch.status) !== isClosedStatus(project.status)) {
    next.completedAt = isClosedStatus(patch.status) ? now : null;
  }
  return next;
}

/** Задачи после правки вех: задачи удалённой вехи остаются в проекте без вехи. */
export function detachRemovedMilestones(tasks: Task[], project: Project): Task[] {
  const ids = new Set(project.milestones.map((m) => m.id));
  return tasks.map((t) =>
    t.projectId === project.id && t.milestoneId !== null && !ids.has(t.milestoneId) ? { ...t, milestoneId: null } : t,
  );
}

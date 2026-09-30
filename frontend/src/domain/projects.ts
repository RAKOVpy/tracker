import type { IsoDate } from '../lib/dates';
import { compareTasks, isOverdue } from './tasks';
import type { Milestone, Project, ProjectInput, ProjectPatch, ProjectStatus, Task } from './types';

/**
 * Проекты. Прогресс, следующий шаг и готовность вех не хранятся, а вычисляются из задач.
 * Задачи проектов на паузе, завершённых и отменённых не попадают в «Сегодня» и список задач:
 * проект отложили — отложили и его дела.
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

/** Задачи в работе: без проекта или из проекта в работе. Проект, которого нет, не прячет задачу. */
export function tasksInWork(tasks: Task[], projects: Project[]): Task[] {
  const paused = new Set(projects.filter((p) => p.status !== 'active').map((p) => p.id));
  return tasks.filter((t) => t.projectId === null || !paused.has(t.projectId));
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

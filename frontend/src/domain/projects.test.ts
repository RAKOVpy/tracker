import { describe, expect, it } from 'vitest';
import {
  applyProjectPatch,
  currentMilestone,
  detachRemovedMilestones,
  isReadyToFinish,
  isStalled,
  milestoneState,
  nextStep,
  projectProgress,
  tasksInWork,
} from './projects';
import { taskInput } from './tasks';
import type { Project, Task } from './types';

const TODAY = '2026-10-07';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'IELTS',
    description: '',
    areaId: null,
    goalId: null,
    status: 'active',
    deadline: null,
    milestones: [
      { id: 'm1', title: 'Диагностика', deadline: '2026-10-05' },
      { id: 'm2', title: 'Writing', deadline: '2026-11-01' },
    ],
    completedAt: null,
    createdAt: 'x',
    ...overrides,
  };
}

function task(id: string, fields: Partial<Task> = {}): Task {
  return { ...taskInput({ title: id, projectId: 'p1' }), id, repeatOf: null, completedAt: null, createdAt: `2026-10-01T00:00:0${id.length}Z`, ...fields };
}

describe('tasksInWork', () => {
  it('прячет задачи проектов не в работе', () => {
    const projects = [project(), project({ id: 'p2', status: 'paused' }), project({ id: 'p3', status: 'done' })];
    const tasks = [task('a'), task('b', { projectId: 'p2' }), task('c', { projectId: 'p3' }), task('d', { projectId: null }), task('e', { projectId: 'нет' })];
    expect(tasksInWork(tasks, projects).map((t) => t.id)).toEqual(['a', 'd', 'e']);
  });
});

describe('projectProgress', () => {
  it('отменённые не считаются', () => {
    const tasks = [task('a', { status: 'done' }), task('b'), task('c', { status: 'cancelled' })];
    expect(projectProgress(tasks)).toEqual({ done: 1, total: 2, open: 1 });
  });
});

describe('nextStep', () => {
  it('по вехам, задачи без вехи — после вех', () => {
    const tasks = [task('none'), task('w', { milestoneId: 'm2' }), task('d', { milestoneId: 'm1' }), task('done', { milestoneId: 'm1', status: 'done' })];
    expect(nextStep(project(), tasks, TODAY)?.id).toBe('d');
  });

  it('задача с прошедшим сроком — раньше вех', () => {
    const tasks = [task('d', { milestoneId: 'm1' }), task('late', { milestoneId: 'm2', deadline: '2026-10-01' })];
    expect(nextStep(project(), tasks, TODAY)?.id).toBe('late');
  });

  it('нет открытых задач — нет шага', () => {
    expect(nextStep(project(), [task('a', { status: 'done' })], TODAY)).toBeNull();
  });
});

describe('milestoneState', () => {
  const [first] = project().milestones;

  it('готова, когда все задачи закрыты и хотя бы одна сделана', () => {
    expect(milestoneState(first, [task('a', { milestoneId: 'm1', status: 'done' }), task('b', { milestoneId: 'm1', status: 'cancelled' })], TODAY)).toEqual({
      done: 1,
      total: 1,
      completed: true,
      overdue: false,
    });
  });

  it('веха без задач не готова; срок прошёл — просрочена', () => {
    expect(milestoneState(first, [], TODAY)).toEqual({ done: 0, total: 0, completed: false, overdue: true });
    expect(milestoneState(first, [task('a', { milestoneId: 'm1' })], '2026-10-05').overdue).toBe(false);
  });
});

describe('currentMilestone', () => {
  it('первая неготовая веха', () => {
    const tasks = [task('a', { milestoneId: 'm1', status: 'done' }), task('b', { milestoneId: 'm2' })];
    expect(currentMilestone(project(), tasks, TODAY)).toEqual({ number: 2, milestone: project().milestones[1] });
    expect(currentMilestone(project(), [...tasks.slice(0, 1), task('b', { milestoneId: 'm2', status: 'done' })], TODAY)).toBe('done');
    expect(currentMilestone(project({ milestones: [] }), tasks, TODAY)).toBeNull();
  });
});

describe('состояние проекта', () => {
  it('без открытых задач проект стоит, все сделаны — можно завершать', () => {
    expect(isStalled(project(), [])).toBe(true);
    expect(isStalled(project(), [task('a')])).toBe(false);
    expect(isStalled(project({ status: 'paused' }), [])).toBe(false);
    expect(isReadyToFinish(project(), [task('a', { status: 'done' })])).toBe(true);
    expect(isReadyToFinish(project(), [])).toBe(false);
    expect(isReadyToFinish(project(), [task('a', { status: 'done' }), task('b')])).toBe(false);
  });

  it('завершение запоминает время, возврат в работу сбрасывает', () => {
    const done = applyProjectPatch(project(), { status: 'done' }, 'now');
    expect(done.completedAt).toBe('now');
    expect(applyProjectPatch(done, { status: 'dropped' }, 'later').completedAt).toBe('now');
    expect(applyProjectPatch(done, { status: 'paused' }, 'later').completedAt).toBeNull();
  });

  it('задачи удалённой вехи остаются в проекте без вехи', () => {
    const tasks = [task('a', { milestoneId: 'm1' }), task('b', { milestoneId: 'm2' }), task('c', { projectId: 'p2', milestoneId: 'm1' })];
    const updated = project({ milestones: [project().milestones[1]] });
    expect(detachRemovedMilestones(tasks, updated).map((t) => [t.id, t.milestoneId])).toEqual([
      ['a', null],
      ['b', 'm2'],
      ['c', 'm1'],
    ]);
  });
});

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
  workTask,
} from './projects';
import { isForToday, taskInput } from './tasks';
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

  it('задачи вехи со сроком сегодня — на «Сегодня», даже добавленные после того, как веха была готова', () => {
    const invite = project({ milestones: [{ id: 'm1', title: 'Создать приглашение', deadline: TODAY }] });
    const done = (id: string) => task(id, { milestoneId: 'm1', status: 'done', completedAt: '2026-10-06T10:00:00Z' });
    const tasks = [done('a'), done('b'), done('c'), task('d', { milestoneId: 'm1' }), task('e', { milestoneId: 'm1' })];
    expect(milestoneState(invite.milestones[0], tasks, TODAY)).toMatchObject({ done: 3, total: 5 });
    const forToday = tasksInWork(tasks, [invite]).filter((t) => isForToday(t, TODAY));
    expect(forToday.map((t) => [t.id, t.deadline, t.deadlineFrom])).toEqual([
      ['d', TODAY, 'milestone'],
      ['e', TODAY, 'milestone'],
    ]);
  });
});

describe('workTask', () => {
  const ielts = project({ deadline: '2026-12-01' });

  it('своего срока нет — срок вехи, у вехи без срока — срок проекта', () => {
    expect(workTask(task('a', { milestoneId: 'm1' }), ielts)).toMatchObject({ deadline: '2026-10-05', deadlineFrom: 'milestone' });
    const noDate = project({ deadline: '2026-12-01', milestones: [{ id: 'm1', title: 'Диагностика', deadline: null }] });
    expect(workTask(task('a', { milestoneId: 'm1' }), noDate)).toMatchObject({ deadline: '2026-12-01', deadlineFrom: 'project' });
    expect(workTask(task('a'), ielts)).toMatchObject({ deadline: '2026-12-01', deadlineFrom: 'project' });
  });

  it('свой срок важнее, а без сроков и без проекта задача остаётся без срока', () => {
    expect(workTask(task('a', { milestoneId: 'm1', deadline: '2026-10-20' }), ielts)).toMatchObject({ deadline: '2026-10-20', deadlineFrom: null });
    expect(workTask(task('a'), project())).toMatchObject({ deadline: null, deadlineFrom: null });
    expect(workTask(task('a', { projectId: null }), undefined)).toMatchObject({ deadline: null, deadlineFrom: null });
  });

  it('срок вехи прошёл — задача просрочена', () => {
    expect(isForToday(workTask(task('a', { milestoneId: 'm1' }), ielts), TODAY)).toBe(true);
    expect(isForToday(task('a', { milestoneId: 'm1' }), TODAY)).toBe(false);
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

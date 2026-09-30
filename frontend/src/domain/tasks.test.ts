import { describe, expect, it } from 'vitest';
import {
  applyTaskPatch,
  carriedFrom,
  checklistProgress,
  compareTasks,
  createTask,
  isForToday,
  postponeCandidates,
  quadrant,
  taskBucket,
  taskInput,
} from './tasks';
import type { Task } from './types';

const TODAY = '2026-10-07'; // среда

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Задача',
    notes: '',
    status: 'todo',
    important: false,
    deadline: null,
    plannedDate: null,
    areaId: null,
    projectId: null,
    milestoneId: null,
    checklist: [],
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('taskBucket', () => {
  it.each([
    [{}, 'someday'],
    [{ deadline: '2026-10-06' }, 'overdue'],
    [{ deadline: '2026-10-06', plannedDate: '2026-10-09' }, 'overdue'],
    [{ plannedDate: '2026-10-07' }, 'today'],
    [{ plannedDate: '2026-10-05' }, 'today'], // вчера не успел — план переходит на сегодня, это не просрочка
    [{ deadline: '2026-10-07' }, 'today'],
    [{ deadline: '2026-10-07', plannedDate: '2026-10-08' }, 'today'],
    [{ plannedDate: '2026-10-08' }, 'tomorrow'],
    [{ plannedDate: '2026-10-14' }, 'week'],
    [{ plannedDate: '2026-10-15' }, 'later'],
    [{ deadline: '2026-10-20' }, 'later'],
    [{ deadline: '2026-10-12' }, 'week'],
  ] as [Partial<Task>, string][])('%j → %s', (fields, bucket) => {
    expect(taskBucket(task(fields), TODAY)).toBe(bucket);
  });

  it('срочная задача без плана — на сегодня, а с планом до срока — по плану', () => {
    expect(taskBucket(task({ deadline: '2026-10-08' }), TODAY)).toBe('today');
    expect(taskBucket(task({ deadline: '2026-10-09' }), TODAY)).toBe('today');
    expect(taskBucket(task({ deadline: '2026-10-09', plannedDate: '2026-10-08' }), TODAY)).toBe('tomorrow');
    // План позже срока — срок важнее.
    expect(taskBucket(task({ deadline: '2026-10-09', plannedDate: '2026-10-12' }), TODAY)).toBe('today');
    // Дедлайн через 3 дня — ещё не срочно.
    expect(taskBucket(task({ deadline: '2026-10-10' }), TODAY)).toBe('week');
  });

  it('план позже дедлайна, но срок не близко — по ближайшей дате', () => {
    expect(taskBucket(task({ deadline: '2026-10-13', plannedDate: '2026-10-20' }), TODAY)).toBe('week');
  });
});

describe('isForToday', () => {
  it('только открытые задачи на сегодня и с прошедшим сроком', () => {
    expect(isForToday(task({ plannedDate: TODAY }), TODAY)).toBe(true);
    expect(isForToday(task({ deadline: '2026-10-01' }), TODAY)).toBe(true);
    expect(isForToday(task({ plannedDate: '2026-10-08' }), TODAY)).toBe(false);
    expect(isForToday(task({ plannedDate: TODAY, status: 'done' }), TODAY)).toBe(false);
    expect(isForToday(task({ plannedDate: TODAY, status: 'inbox' }), TODAY)).toBe(false);
  });
});

describe('carriedFrom', () => {
  it('прошедший план — «перенесено с», сегодняшний — нет', () => {
    expect(carriedFrom(task({ plannedDate: '2026-10-05' }), TODAY)).toBe('2026-10-05');
    expect(carriedFrom(task({ plannedDate: TODAY }), TODAY)).toBeNull();
    expect(carriedFrom(task(), TODAY)).toBeNull();
  });
});

describe('compareTasks', () => {
  it('сначала с прошедшим сроком, потом важные, потом по дедлайну, плану и времени создания', () => {
    const list = [
      task({ id: 'plain-late', createdAt: '2026-10-02T00:00:00Z' }),
      task({ id: 'plain-early', createdAt: '2026-10-01T00:00:00Z' }),
      task({ id: 'planned', plannedDate: '2026-10-07' }),
      task({ id: 'deadline', deadline: '2026-10-09' }),
      task({ id: 'important', important: true }),
      task({ id: 'overdue', deadline: '2026-10-01' }),
    ];
    expect([...list].sort((a, b) => compareTasks(a, b, TODAY)).map((t) => t.id)).toEqual([
      'overdue',
      'important',
      'deadline',
      'planned',
      'plain-early',
      'plain-late',
    ]);
  });
});

describe('quadrant', () => {
  it('важность ручная, срочность — дедлайн в ближайшие 2 дня или прошедший', () => {
    expect(quadrant(task({ important: true, deadline: '2026-10-08' }), TODAY)).toBe('do');
    expect(quadrant(task({ important: true, deadline: '2026-10-01' }), TODAY)).toBe('do');
    expect(quadrant(task({ important: true }), TODAY)).toBe('plan');
    expect(quadrant(task({ important: true, deadline: '2026-10-20' }), TODAY)).toBe('plan');
    expect(quadrant(task({ deadline: '2026-10-07' }), TODAY)).toBe('quick');
    expect(quadrant(task({ plannedDate: '2026-10-07' }), TODAY)).toBe('later');
  });
});

describe('закрытие задачи', () => {
  const now = '2026-10-07T18:00:00.000Z';

  it('сделанная или отменённая запоминает время, возвращённая в работу — сбрасывает', () => {
    const done = applyTaskPatch(task(), { status: 'done' }, now);
    expect(done.completedAt).toBe(now);
    expect(applyTaskPatch(done, { status: 'cancelled' }, 'позже').completedAt).toBe(now);
    expect(applyTaskPatch(done, { status: 'todo' }, 'позже').completedAt).toBeNull();
    expect(applyTaskPatch(task(), { title: 'Новое' }, now).completedAt).toBeNull();
  });

  it('смена проекта сбрасывает веху, если новая не указана', () => {
    const inProject = task({ projectId: 'p1', milestoneId: 'm1' });
    expect(applyTaskPatch(inProject, { projectId: 'p2' }, now).milestoneId).toBeNull();
    expect(applyTaskPatch(inProject, { projectId: null }, now).milestoneId).toBeNull();
    expect(applyTaskPatch(inProject, { projectId: 'p2', milestoneId: 'm7' }, now).milestoneId).toBe('m7');
    expect(applyTaskPatch(inProject, { title: 'Новое' }, now).milestoneId).toBe('m1');
    expect(createTask(taskInput({ title: 'x', milestoneId: 'm1' }), { id: 'a', now }).milestoneId).toBeNull();
  });

  it('новая задача сразу сделанной получает время', () => {
    expect(createTask(taskInput({ title: 'x', status: 'done' }), { id: 'a', now }).completedAt).toBe(now);
    expect(createTask(taskInput({ title: 'x', status: 'inbox' }), { id: 'a', now }).completedAt).toBeNull();
  });
});

describe('postponeCandidates', () => {
  it('переносятся задачи на сегодня без сегодняшнего или прошедшего срока', () => {
    const list = [
      task({ id: 'planned', plannedDate: TODAY }),
      task({ id: 'carried', plannedDate: '2026-10-05' }),
      task({ id: 'urgent', deadline: '2026-10-08' }),
      task({ id: 'due-today', deadline: TODAY }),
      task({ id: 'overdue', deadline: '2026-10-05' }),
      task({ id: 'tomorrow', plannedDate: '2026-10-08' }),
      task({ id: 'done', plannedDate: TODAY, status: 'done' }),
    ];
    expect(postponeCandidates(list, TODAY).map((t) => t.id)).toEqual(['planned', 'carried', 'urgent']);
  });

  it('после переноса задача уходит на завтра', () => {
    const moved = task({ deadline: '2026-10-08', plannedDate: '2026-10-08' });
    expect(taskBucket(moved, TODAY)).toBe('tomorrow');
  });
});

describe('checklistProgress', () => {
  it('считает отмеченные пункты', () => {
    const checklist = [
      { id: '1', text: 'a', done: true },
      { id: '2', text: 'b', done: false },
    ];
    expect(checklistProgress(task({ checklist }))).toEqual({ done: 1, total: 2 });
  });
});

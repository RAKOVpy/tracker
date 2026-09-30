import { describe, expect, it } from 'vitest';
import { detachRemovedParts, nextPart, numberedParts, partsProgress, partStates, partStatusLabel, summaryTaskTitle } from './parts';
import { taskInput } from './tasks';
import type { Material, Task } from './types';

const TODAY = '2026-10-07';

const material = (fields: Partial<Material> = {}): Material => ({
  id: 'm1',
  title: 'Чистый код',
  type: 'book',
  author: '',
  url: '',
  areaId: null,
  status: 'active',
  parts: [
    { id: 'p1', title: 'Глава 1', status: 'studied' },
    { id: 'p2', title: 'Глава 2', status: 'todo' },
    { id: 'p3', title: 'Глава 3', status: 'todo' },
  ],
  obsidianPath: null,
  createdAt: 'x',
  ...fields,
});

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  ...taskInput({ title: id, materialId: 'm1' }),
  id,
  repeatOf: null,
  completedAt: null,
  createdAt: `2026-10-01T00:00:0${id.length}Z`,
  ...fields,
});

describe('partStates', () => {
  it('сделанная задача-конспект делает часть законспектированной; открытая — показывается', () => {
    const tasks = [
      task('a', { partId: 'p1', status: 'done' }),
      task('b', { partId: 'p2', deadline: '2026-10-09' }),
      task('c', { partId: 'p2', deadline: '2026-10-08' }),
      task('d', { partId: 'p3', status: 'cancelled' }),
      // Задачи другого материала не считаются.
      task('e', { materialId: 'm2', partId: 'p3', status: 'done' }),
    ];
    const states = partStates(material(), tasks, TODAY);
    expect(states.map((s) => [s.status, s.byTask, s.task?.id ?? null])).toEqual([
      ['summarized', true, null],
      ['todo', false, 'c'],
      ['todo', false, null],
    ]);
  });

  it('вернули задачу в работу — часть снова в статусе, отмеченном вручную', () => {
    const states = partStates(material(), [task('a', { partId: 'p1', status: 'todo' })], TODAY);
    expect(states[0]).toMatchObject({ status: 'studied', byTask: false });
  });
});

describe('partsProgress и nextPart', () => {
  it('считает законспектированные и прочитанные; следующая — первая незаконспектированная', () => {
    const m = material({
      parts: [
        { id: 'p1', title: 'Глава 1', status: 'summarized' },
        { id: 'p2', title: 'Глава 2', status: 'studied' },
        { id: 'p3', title: 'Глава 3', status: 'todo' },
      ],
    });
    const states = partStates(m, [], TODAY);
    expect(partsProgress(states)).toEqual({ total: 3, summarized: 1, studied: 1 });
    expect(nextPart(states)?.part.id).toBe('p2');
    expect(nextPart(partStates(material({ parts: [] }), [], TODAY))).toBeNull();
  });
});

describe('numberedParts', () => {
  let n = 0;
  const newId = () => `n${++n}`;

  it('продолжает нумерацию частей с тем же названием', () => {
    const existing = material().parts;
    expect(numberedParts(existing, 'Глава', 2, newId).map((p) => p.title)).toEqual(['Глава 4', 'Глава 5']);
    expect(numberedParts(existing, 'глава', 1, newId)[0].title).toBe('глава 4');
    expect(numberedParts(existing, 'Лекция', 2, newId).map((p) => p.title)).toEqual(['Лекция 1', 'Лекция 2']);
  });

  it('спецсимволы в названии не ломают поиск', () => {
    expect(numberedParts([{ id: 'x', title: 'Ч. (1) 3', status: 'todo' }], 'Ч. (1)', 1, newId)[0].title).toBe('Ч. (1) 4');
  });

  it('новые части не начаты и с новыми id', () => {
    const [part] = numberedParts([], 'Урок', 1, () => 'id-1');
    expect(part).toEqual({ id: 'id-1', title: 'Урок 1', status: 'todo' });
  });
});

describe('detachRemovedParts', () => {
  it('задачи удалённых частей остаются у материала без части', () => {
    const tasks = [task('a', { partId: 'p1' }), task('b', { partId: 'p9' }), task('c', { materialId: 'm2', partId: 'p9' })];
    expect(detachRemovedParts(tasks, material()).map((t) => [t.materialId, t.partId])).toEqual([
      ['m1', 'p1'],
      ['m1', null],
      ['m2', 'p9'],
    ]);
  });
});

describe('подписи', () => {
  it('статус зависит от типа материала', () => {
    expect(partStatusLabel('studied', 'book')).toBe('прочитана');
    expect(partStatusLabel('studied', 'video')).toBe('просмотрена');
    expect(partStatusLabel('studied', 'course')).toBe('пройдена');
    expect(partStatusLabel('todo', 'lecture')).toBe('не начата');
    expect(partStatusLabel('summarized', 'article')).toBe('законспектирована');
  });

  it('название задачи-конспекта', () => {
    expect(summaryTaskTitle({ id: 'p', title: 'Глава 5', status: 'todo' })).toBe('Законспектировать: Глава 5');
  });
});

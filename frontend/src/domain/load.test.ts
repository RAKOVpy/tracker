import { describe, expect, it } from 'vitest';
import { backlogClearedOn, checkStart, DEFAULT_SETTINGS, forecastReviews, planReviews } from './load';
import { withState } from './review';
import type { Material, Note, Review, Settings } from './types';

const today = '2026-10-10';

function note(id: string, addedOn: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    materialId: null,
    questions: [],
    summary: '',
    obsidianUri: '',
    status: 'active',
    addedOn,
    obsidianPath: null,
    createdAt: 'x',
    ...overrides,
  };
}

function reviewedToday(noteId: string): Review {
  return { id: `r-${noteId}`, noteId, date: today, rating: 'good', explain: null, taught: false, createdAt: `${today}T10:00:00Z` };
}

/** n заметок, срок которых наступил `daysAgo` дней назад. */
function dueNotes(n: number, daysAgo: number, prefix = 'n') {
  const addedOn = `2026-10-${String(9 - daysAgo).padStart(2, '0')}`;
  return Array.from({ length: n }, (_, i) => withState(note(`${prefix}${i}`, addedOn), [], today));
}

const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, dailyReviewLimit: 5, ...overrides });

describe('planReviews', () => {
  it('бюджет: сегодня не больше лимита, остальное переносится', () => {
    const load = planReviews(dueNotes(8, 0), settings(), today, []);
    expect(load.queue).toHaveLength(5);
    expect(load.deferred).toHaveLength(3);
    expect(load.overdue).toBe(0);
    expect(load.inDebt).toBe(false);
  });

  it('уже повторённые сегодня расходуют бюджет', () => {
    const done = [withState(note('a', '2026-10-01'), [reviewedToday('a')], today), withState(note('b', '2026-10-01'), [reviewedToday('b')], today)];
    const load = planReviews([...done, ...dueNotes(8, 0)], settings(), today, []);
    expect(load.reviewedToday).toBe(2);
    expect(load.queue).toHaveLength(3);
  });

  it('сначала самые давние, долг — когда с прошлых дней ждёт больше бюджета', () => {
    const old = dueNotes(6, 3, 'old');
    const fresh = dueNotes(2, 0, 'new');
    const load = planReviews([...fresh, ...old], settings(), today, []);
    expect(load.queue.every((n) => n.note.id.startsWith('old'))).toBe(true);
    expect(load.overdue).toBe(6);
    expect(load.inDebt).toBe(true);
    expect(planReviews(old, settings({ dailyReviewLimit: 6 }), today, []).inDebt).toBe(false);
  });

  it('в отпуске очередь пуста', () => {
    const vacations = [{ id: 'v', start: today, end: null, createdAt: 'x' }];
    const notes = [note('a', '2026-10-01')].map((n) => withState(n, [], today, vacations));
    const load = planReviews(notes, settings(), today, vacations);
    expect(load.vacation?.id).toBe('v');
    expect(load.queue).toHaveLength(0);
  });
});

describe('forecastReviews', () => {
  it('долг разбирается по бюджету, повторённые уходят на следующий интервал', () => {
    const notes = dueNotes(12, 2);
    const forecast = forecastReviews(notes, { today, days: 5, budget: 5, reviewedToday: 0, vacations: [] });
    // Новые заметки после первого повторения возвращаются через день, поэтому долг тает не сразу.
    expect(forecast.map((d) => d.reviews)).toEqual([5, 5, 5, 5, 4]);
    expect(forecast.map((d) => d.carried)).toEqual([7, 7, 7, 4, 0]);
    expect(backlogClearedOn(forecast)).toBe('2026-10-14');
    expect(backlogClearedOn(forecast.slice(0, 4))).toBeNull();
  });

  it('сегодня учитывает уже сделанное, дни отпуска пусты', () => {
    const vacations = [{ id: 'v', start: '2026-10-11', end: '2026-10-11', createdAt: 'x' }];
    const forecast = forecastReviews(dueNotes(3, 0), { today, days: 3, budget: 5, reviewedToday: 4, vacations });
    expect(forecast[0]).toMatchObject({ reviews: 5, done: 4, carried: 2 });
    expect(forecast[1]).toMatchObject({ vacation: true, reviews: 0 });
    // 2 перенесённые + 1 повторённая сегодня: её интервал в 1 день сдвинулся за отпуск.
    expect(forecast[2]).toMatchObject({ reviews: 3, carried: 0 });
  });

  it('заметки на паузе не считаются', () => {
    const paused = [withState(note('p', '2026-10-01', { status: 'paused' }), [], today)];
    expect(forecastReviews(paused, { today, days: 3, budget: 5, reviewedToday: 0, vacations: [] }).every((d) => d.reviews === 0)).toBe(true);
  });
});

describe('checkStart', () => {
  const material = (id: string, status: Material['status']): Material => ({
    id,
    title: id,
    type: 'book',
    parts: [],
    author: '',
    url: '',
    areaId: null,
    status,
    obsidianPath: null,
    createdAt: 'x',
  });
  const calm = planReviews([], settings(), today, []);

  it('лимит одновременно изучаемых материалов', () => {
    const materials = [material('a', 'active'), material('b', 'active'), material('c', 'active'), material('d', 'queued')];
    expect(checkStart(materials, calm, settings()).blockers).toEqual(['limit']);
    expect(checkStart(materials.slice(1), calm, settings()).blockers).toEqual([]);
    expect(checkStart(materials, calm, settings({ activeMaterialsLimit: 4 })).blockers).toEqual([]);
  });

  it('материал, который уже изучается, не мешает сам себе', () => {
    const materials = [material('a', 'active'), material('b', 'active'), material('c', 'active')];
    expect(checkStart(materials, calm, settings(), 'c').blockers).toEqual([]);
  });

  it('долг повторений и строгий режим', () => {
    const debt = planReviews(dueNotes(6, 3), settings(), today, []);
    const check = checkStart([], debt, settings({ strictMode: true }));
    expect(check.blockers).toEqual(['debt']);
    expect(check.strict).toBe(true);
  });
});

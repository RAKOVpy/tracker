import { describe, expect, it } from 'vitest';
import { addDays } from '../lib/dates';
import {
  compareForReview,
  computeNoteState,
  estimateMinutes,
  INTERVALS,
  levelFor,
  projectReview,
  schedule,
  withState,
} from './review';
import type { ExplainAnswer, Note, Rating, Review } from './types';

const note: Note = {
  id: 'n1',
  title: 'Графы: обход в ширину и в глубину',
  materialId: null,
  questions: ['Чем BFS отличается от DFS?', 'Когда выбрать DFS?', 'Какая сложность у BFS?'],
  summary: '',
  obsidianUri: '',
  status: 'active',
  addedOn: '2026-10-01',
  createdAt: '2026-10-01T10:00:00.000Z',
};

let seq = 0;
function review(date: string, rating: Rating, explain: ExplainAnswer | null = null, taught = false): Review {
  seq += 1;
  return { id: `r${seq}`, noteId: 'n1', date, rating, explain, taught, createdAt: `${date}T20:00:${String(seq % 60).padStart(2, '0')}Z` };
}

/** Серия повторений строго в срок с одной и той же оценкой. */
function chain(ratings: Rating[], explain: ExplainAnswer | null = null): Review[] {
  const reviews: Review[] = [];
  for (const rating of ratings) {
    const due = computeNoteState(note, reviews).dueDate;
    reviews.push(review(due, rating, explain));
  }
  return reviews;
}

describe('schedule', () => {
  it('«хорошо» ведёт по лестнице интервалов', () => {
    let step = 0;
    const intervals: number[] = [];
    for (let i = 0; i < 8; i++) {
      const next = schedule(step, 'good');
      intervals.push(next.interval);
      step = next.step;
    }
    expect(intervals).toEqual([1, 3, 7, 16, 35, 90, 180, 180]);
  });

  it('«легко» перескакивает ступень, «с трудом» повторяет прошлый интервал', () => {
    expect(schedule(0, 'easy')).toEqual({ interval: 3, step: 2 });
    expect(schedule(3, 'hard')).toEqual({ interval: 7, step: 3 });
    expect(schedule(0, 'hard')).toEqual({ interval: 1, step: 0 });
  });

  it('«забыл» — завтра, ступень падает вдвое', () => {
    expect(schedule(5, 'again')).toEqual({ interval: 1, step: 2 });
    expect(schedule(1, 'again')).toEqual({ interval: 1, step: 0 });
  });
});

describe('computeNoteState', () => {
  it('новая заметка: первое повторение на следующий день, уровень 1', () => {
    const s = computeNoteState(note, []);
    expect(s.dueDate).toBe('2026-10-02');
    expect(s.level).toBe(1);
    expect(s.reviewCount).toBe(0);
    expect(s.lastReviewed).toBeNull();
  });

  it('повторения в срок: даты растут по лестнице, уровень — 2 после двух, 3 после четырёх', () => {
    const reviews = chain(['good', 'good', 'good', 'good']);
    expect(reviews.map((r) => r.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-06', '2026-10-13']);
    expect(computeNoteState(note, reviews.slice(0, 1)).level).toBe(1);
    expect(computeNoteState(note, reviews.slice(0, 2)).level).toBe(2);
    const s = computeNoteState(note, reviews);
    expect(s.level).toBe(3);
    expect(s.dueDate).toBe(addDays('2026-10-13', 16));
    expect(s.lastInterval).toBe(16);
  });

  it('«забыл» снижает уровень, но не обнуляет прогресс', () => {
    const reviews = chain(['good', 'good', 'good', 'good', 'again']);
    const s = computeNoteState(note, reviews);
    expect(s.lapses).toBe(1);
    expect(s.step).toBe(2);
    expect(s.level).toBe(2);
    expect(s.lastInterval).toBe(1);
  });

  it('уровень 4 — дважды подряд «объясню уверенно», уровень 5 — ещё и объяснил на деле', () => {
    const base = chain(['good', 'good']);
    const confident = [...base, review('2026-10-06', 'good', 'yes'), review('2026-10-13', 'good', 'yes')];
    expect(computeNoteState(note, confident).level).toBe(4);
    const taught = [...confident, review('2026-10-20', 'good', 'yes', true)];
    expect(computeNoteState(note, taught).level).toBe(5);
  });

  it('до второй ступени уверенность не поднимает уровень', () => {
    const reviews = [review('2026-10-02', 'good', 'yes'), review('2026-10-02', 'hard', 'yes')];
    expect(computeNoteState(note, reviews).level).toBe(1);
  });

  it('пропущенная самооценка не сбрасывает серию, «с подсказками» и «забыл» сбрасывают', () => {
    const base = chain(['good', 'good']);
    const skipped = [...base, review('2026-10-06', 'good', 'yes'), review('2026-10-13', 'good'), review('2026-10-29', 'good', 'yes')];
    expect(computeNoteState(note, skipped).confidentStreak).toBe(2);
    const hints = [...base, review('2026-10-06', 'good', 'yes'), review('2026-10-13', 'good', 'hints')];
    expect(computeNoteState(note, hints).confidentStreak).toBe(0);
    const lapse = [...base, review('2026-10-06', 'good', 'yes', true), review('2026-10-13', 'again', 'yes')];
    const s = computeNoteState(note, lapse);
    expect(s.confidentStreak).toBe(0);
    expect(s.taught).toBe(false);
  });

  it('порядок записей в журнале не важен', () => {
    const reviews = chain(['good', 'good', 'hard']);
    expect(computeNoteState(note, [...reviews].reverse())).toEqual(computeNoteState(note, reviews));
  });
});

describe('levelFor', () => {
  it('порог уровней', () => {
    expect([0, 1, 2, 3, 4, 9].map((step) => levelFor(step, 0, false))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(levelFor(2, 2, false)).toBe(4);
    expect(levelFor(2, 2, true)).toBe(5);
    expect(levelFor(1, 5, true)).toBe(1);
  });
});

describe('withState', () => {
  it('к повторению: срок наступил и заметка не на паузе', () => {
    expect(withState(note, [], '2026-10-01').isDue).toBe(false);
    expect(withState(note, [], '2026-10-02').isDue).toBe(true);
    const late = withState(note, [], '2026-10-05');
    expect(late.overdueDays).toBe(3);
    expect(withState({ ...note, status: 'paused' }, [], '2026-10-05').isDue).toBe(false);
  });
});

describe('projectReview', () => {
  it('показывает дату и уровень после оценки, не меняя журнал', () => {
    const reviews = chain(['good']);
    const good = projectReview(note, reviews, { rating: 'good', explain: null, taught: false }, '2026-10-03');
    expect(good.dueDate).toBe('2026-10-06');
    expect(good.level).toBe(2);
    const again = projectReview(note, reviews, { rating: 'again', explain: null, taught: false }, '2026-10-03');
    expect(again.dueDate).toBe('2026-10-04');
    expect(reviews).toHaveLength(1);
  });
});

describe('очередь и время', () => {
  it('сначала самые просроченные', () => {
    const a = withState({ ...note, id: 'a', addedOn: '2026-10-03' }, [], '2026-10-10');
    const b = withState({ ...note, id: 'b', addedOn: '2026-10-01' }, [], '2026-10-10');
    expect([a, b].sort(compareForReview).map((x) => x.note.id)).toEqual(['b', 'a']);
  });

  it('минута на вопрос, минимум две минуты на заметку', () => {
    expect(estimateMinutes([note, { ...note, questions: [] }])).toBe(5);
  });

  it('интервалы по возрастанию', () => {
    expect([...INTERVALS].sort((x, y) => x - y)).toEqual(INTERVALS);
  });
});

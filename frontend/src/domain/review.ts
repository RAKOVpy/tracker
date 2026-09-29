import { addDays, diffDays, type IsoDate } from '../lib/dates';
import type { ExplainAnswer, MasteryLevel, Note, Rating, Review } from './types';

/**
 * Интервалы между повторениями в днях. Каждое успешное повторение переводит заметку
 * на следующую ступень: 1 → 3 → 7 → 16 → 35 → 90 → 180 дней.
 */
export const INTERVALS = [1, 3, 7, 16, 35, 90, 180];

export const LEVELS: Record<MasteryLevel, { label: string; hint: string }> = {
  1: { label: 'Конспект готов', hint: 'Ответьте на вопросы. Можно подглядывать в заметку.' },
  2: { label: 'Пересказ с подсказками', hint: 'Ответьте на вопросы по памяти, потом сверьтесь с заметкой.' },
  3: { label: 'Пересказ по памяти', hint: 'Перескажите тему целиком, не открывая заметку.' },
  4: { label: 'Объяснение', hint: 'Объясните тему простыми словами, как новичку.' },
  5: { label: 'Научил другого', hint: 'Объясните тему простыми словами. Можно рассказать её кому-то ещё.' },
};

export const RATINGS: { value: Rating; label: string }[] = [
  { value: 'again', label: 'Забыл' },
  { value: 'hard', label: 'С трудом' },
  { value: 'good', label: 'Хорошо' },
  { value: 'easy', label: 'Легко' },
];

export const EXPLAIN_OPTIONS: { value: ExplainAnswer; label: string }[] = [
  { value: 'no', label: 'Нет' },
  { value: 'hints', label: 'С подсказками' },
  { value: 'yes', label: 'Да, уверенно' },
];

export interface NoteState {
  /** Ступень расписания: сколько успешных шагов пройдено. */
  step: number;
  level: MasteryLevel;
  dueDate: IsoDate;
  lastReviewed: IsoDate | null;
  /** Интервал, назначенный последним повторением. */
  lastInterval: number | null;
  reviewCount: number;
  lapses: number;
  /** Сколько повторений подряд ответ на «смог бы объяснить?» был «да, уверенно». */
  confidentStreak: number;
  /** Объяснял другому после последнего «забыл». */
  taught: boolean;
}

export interface NoteWithState {
  note: Note;
  reviews: Review[];
  state: NoteState;
  isDue: boolean;
  overdueDays: number;
}

function clampIndex(index: number): number {
  return Math.min(Math.max(index, 0), INTERVALS.length - 1);
}

/**
 * Следующий интервал по оценке:
 * - забыл — повторить завтра, ступень падает вдвое (тему нужно освежить, но не с нуля);
 * - с трудом — предыдущий интервал, ступень не меняется;
 * - хорошо — интервал текущей ступени, ступень +1;
 * - легко — интервал через ступень, ступень +2.
 */
export function schedule(step: number, rating: Rating): { interval: number; step: number } {
  switch (rating) {
    case 'again':
      return { interval: INTERVALS[0], step: Math.floor(step / 2) };
    case 'hard':
      return { interval: INTERVALS[clampIndex(step - 1)], step };
    case 'good':
      return { interval: INTERVALS[clampIndex(step)], step: step + 1 };
    case 'easy':
      return { interval: INTERVALS[clampIndex(step + 1)], step: step + 2 };
  }
}

/**
 * Уровень освоения:
 * 1 — пока меньше двух успешных повторений; 2 — два и больше; 3 — четыре и больше (около месяца);
 * 4 — от уровня 2 и дважды подряд «смог бы объяснить уверенно»; 5 — то же плюс объяснил кому-то на деле.
 */
export function levelFor(step: number, confidentStreak: number, taught: boolean): MasteryLevel {
  const base: MasteryLevel = step >= 4 ? 3 : step >= 2 ? 2 : 1;
  if (base >= 2 && confidentStreak >= 2) return taught ? 5 : 4;
  return base;
}

function byTime(a: Review, b: Review): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

/** Состояние заметки — результат «проигрывания» всего журнала повторений. */
export function computeNoteState(note: Note, reviews: Review[]): NoteState {
  let step = 0;
  let lapses = 0;
  let confidentStreak = 0;
  let taught = false;
  let dueDate = addDays(note.addedOn, 1);
  let lastReviewed: IsoDate | null = null;
  let lastInterval: number | null = null;

  for (const review of [...reviews].sort(byTime)) {
    const next = schedule(step, review.rating);
    step = next.step;
    if (review.rating === 'again') {
      lapses += 1;
      confidentStreak = 0;
      taught = false;
    } else {
      if (review.explain === 'yes') confidentStreak += 1;
      else if (review.explain !== null) confidentStreak = 0;
      if (review.taught) taught = true;
    }
    dueDate = addDays(review.date, next.interval);
    lastReviewed = review.date;
    lastInterval = next.interval;
  }

  return {
    step,
    level: levelFor(step, confidentStreak, taught),
    dueDate,
    lastReviewed,
    lastInterval,
    reviewCount: reviews.length,
    lapses,
    confidentStreak,
    taught,
  };
}

export function withState(note: Note, reviews: Review[], today: IsoDate): NoteWithState {
  const state = computeNoteState(note, reviews);
  const isDue = note.status === 'active' && state.dueDate <= today;
  return { note, reviews, state, isDue, overdueDays: isDue ? diffDays(state.dueDate, today) : 0 };
}

/** Что будет после повторения с такой оценкой сегодня — для подписей на кнопках. */
export function projectReview(
  note: Note,
  reviews: Review[],
  input: Pick<Review, 'rating' | 'explain' | 'taught'>,
  today: IsoDate,
): NoteState {
  const next: Review = { ...input, id: '__preview__', noteId: note.id, date: today, createdAt: '￿' };
  return computeNoteState(note, [...reviews, next]);
}

/** Примерное время на повторение: минута на вопрос, но не меньше двух минут на заметку. */
export function estimateMinutes(notes: Note[]): number {
  return notes.reduce((sum, note) => sum + Math.max(2, note.questions.length), 0);
}

/** Очередь повторения: сначала самые просроченные, затем слабее освоенные. */
export function compareForReview(a: NoteWithState, b: NoteWithState): number {
  return a.state.dueDate.localeCompare(b.state.dueDate) || a.state.level - b.state.level;
}

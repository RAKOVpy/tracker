import { addDays, type IsoDate } from '../lib/dates';
import { compareForReview, schedule, type NoteWithState } from './review';
import type { Material, Settings, Vacation } from './types';
import { currentVacation, isVacationDay, shiftForVacations } from './vacation';

/**
 * Мягкие лимиты нагрузки. Ничего не запрещается намертво: лишние повторения переносятся на
 * следующие дни, а новый материал при перегрузке начинается только осознанно.
 */

export const DEFAULT_SETTINGS: Settings = {
  dailyReviewLimit: 15,
  activeMaterialsLimit: 3,
  newNotesPerDay: 5,
  strictMode: false,
};

export const SETTINGS_RANGES: Record<Exclude<keyof Settings, 'strictMode'>, { min: number; max: number }> = {
  dailyReviewLimit: { min: 1, max: 100 },
  activeMaterialsLimit: { min: 1, max: 10 },
  newNotesPerDay: { min: 1, max: 50 },
};

/** Сколько заметок добавляет кнопка «Повторить ещё», когда дневной бюджет выполнен. */
export const EXTRA_CHUNK = 5;

export interface ReviewLoad {
  /** Все заметки, срок которых наступил, в порядке очереди. */
  due: NoteWithState[];
  /** Очередь на сегодня в пределах бюджета. */
  queue: NoteWithState[];
  /** Сверх бюджета — перенесены на следующие дни. */
  deferred: NoteWithState[];
  /** Сколько разных заметок уже повторено сегодня: они тоже расходуют бюджет. */
  reviewedToday: number;
  budget: number;
  /** Сколько заметок ждут с прошлых дней. */
  overdue: number;
  /** Долг: с прошлых дней накопилось больше, чем дневной бюджет. */
  inDebt: boolean;
  /** Отпуск, который идёт сегодня. */
  vacation: Vacation | null;
}

export function planReviews(notes: NoteWithState[], settings: Settings, today: IsoDate, vacations: Vacation[]): ReviewLoad {
  const due = notes.filter((n) => n.isDue).sort(compareForReview);
  const reviewedToday = notes.filter((n) => n.reviews.some((r) => r.date === today)).length;
  const budget = settings.dailyReviewLimit;
  const left = Math.max(0, budget - reviewedToday);
  const overdue = due.filter((n) => n.overdueDays > 0).length;
  return {
    due,
    queue: due.slice(0, left),
    deferred: due.slice(left),
    reviewedToday,
    budget,
    overdue,
    inDebt: overdue > budget,
    vacation: currentVacation(vacations, today),
  };
}

export interface ForecastDay {
  date: IsoDate;
  /** Повторений в этот день в пределах бюджета (сегодня — вместе с уже сделанными). */
  reviews: number;
  /** Сегодня: сколько уже повторено. */
  done: number;
  /** Сколько заметок не поместилось в бюджет и переходит на следующий день. */
  carried: number;
  vacation: boolean;
}

/**
 * Прогноз нагрузки: каждый день повторяется не больше бюджета, каждая заметка вспоминается «хорошо»
 * и уходит на следующий интервал. Заметки, не поместившиеся в бюджет, переходят на следующий день.
 */
export function forecastReviews(
  notes: NoteWithState[],
  { today, days, budget, reviewedToday, vacations }: { today: IsoDate; days: number; budget: number; reviewedToday: number; vacations: Vacation[] },
): ForecastDay[] {
  const items = notes
    .filter((n) => n.note.status === 'active')
    .map((n) => ({ due: n.state.dueDate, step: n.state.step, level: n.state.level }));
  const result: ForecastDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    if (isVacationDay(date, vacations, today)) {
      result.push({ date, reviews: 0, done: 0, carried: 0, vacation: true });
      continue;
    }
    const done = i === 0 ? reviewedToday : 0;
    const capacity = Math.max(0, budget - done);
    const dueNow = items
      .filter((item) => item.due <= date)
      .sort((a, b) => a.due.localeCompare(b.due) || a.level - b.level);
    const taken = dueNow.slice(0, capacity);
    for (const item of taken) {
      const next = schedule(item.step, 'good');
      item.step = next.step;
      item.due = shiftForVacations(date, addDays(date, next.interval), vacations, today);
    }
    result.push({ date, reviews: done + taken.length, done, carried: dueNow.length - taken.length, vacation: false });
  }
  return result;
}

/** Первый день прогноза, после которого ничего не переносится, или null, если за прогноз долг не разобрать. */
export function backlogClearedOn(forecast: ForecastDay[]): IsoDate | null {
  return forecast.find((day) => !day.vacation && day.carried === 0)?.date ?? null;
}

export type StartBlocker = 'limit' | 'debt';

export interface StartCheck {
  /** Почему новый материал лучше не начинать; пусто — можно начинать. */
  blockers: StartBlocker[];
  /** Строгий режим: начать нельзя, только поставить в очередь. */
  strict: boolean;
  active: Material[];
  limit: number;
  load: ReviewLoad;
}

/** Можно ли начать изучать ещё один материал. `except` — материал, который уже изучается. */
export function checkStart(materials: Material[], load: ReviewLoad, settings: Settings, except?: string): StartCheck {
  const active = materials.filter((m) => m.status === 'active' && m.id !== except);
  const blockers: StartBlocker[] = [];
  if (active.length >= settings.activeMaterialsLimit) blockers.push('limit');
  if (load.inDebt) blockers.push('debt');
  return { blockers, strict: settings.strictMode, active, limit: settings.activeMaterialsLimit, load };
}

/** Примерное время на повторения: 2–3 минуты на заметку. */
export function describeBudget(notes: number): string {
  return `≈ ${notes * 2}–${notes * 3} мин`;
}

/**
 * Календарные даты храним строками 'YYYY-MM-DD' (как DateField в DRF).
 * Все вычисления — через UTC, чтобы переход на летнее время не сдвигал дни.
 */
export type IsoDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Сегодняшняя дата в часовом поясе пользователя. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtcMs(target.getTime());
}

/** Количество дней от `from` до `to` (to - from). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

const shortFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });

export function formatShort(date: IsoDate): string {
  return shortFormatter.format(toUtcMs(date)).replace('.', '');
}

export function formatLong(date: IsoDate): string {
  return longFormatter.format(toUtcMs(date));
}

export function formatWeekday(date: IsoDate): string {
  return weekdayFormatter.format(toUtcMs(date));
}

/** «сегодня», «вчера» или короткая дата. */
export function formatRelative(date: IsoDate, today: IsoDate = todayIso()): string {
  const diff = diffDays(date, today);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return formatShort(date);
}

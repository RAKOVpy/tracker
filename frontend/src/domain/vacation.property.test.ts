import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from '../lib/dates';
import type { Vacation } from './types';
import { isVacationDay, shiftForVacations } from './vacation';

/**
 * Проверка «заморозки времени» перебором по дням. Модель: срок — interval-й день после anchor,
 * если не считать дни отпуска. Если он уже прошёл, просрочка — число дней не в отпуске после срока
 * по сегодняшний день включительно; срок = сегодня − просрочка.
 */
function bruteForce(anchor: string, interval: number, vacations: Vacation[], today: string): string {
  let day = anchor;
  let counted = 0;
  while (counted < interval) {
    day = addDays(day, 1);
    if (!isVacationDay(day, vacations, today)) counted += 1;
  }
  if (day > today) return day;
  let overdue = 0;
  for (let d = addDays(day, 1); d <= today; d = addDays(d, 1)) {
    if (!isVacationDay(d, vacations, today)) overdue += 1;
  }
  return addDays(today, -overdue);
}

/** Детерминированный генератор, чтобы падение воспроизводилось. */
function lcg(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    // Старшие биты: младшие у такого генератора повторяются с коротким периодом.
    return Math.floor((state / 2 ** 31) * max);
  };
}

function randomVacations(rand: (max: number) => number, base: string, today: string): Vacation[] {
  const result: Vacation[] = [];
  let cursor = addDays(base, rand(10));
  const count = rand(4);
  for (let i = 0; i < count; i++) {
    const start = cursor;
    const length = 1 + rand(10);
    const openEnded = i === count - 1 && start <= today && rand(3) === 0;
    const end = openEnded ? null : addDays(start, length - 1);
    result.push({ id: `v${i}`, start, end, createdAt: 'x' });
    cursor = addDays(start, length + 1 + rand(8));
  }
  return result;
}

describe('shiftForVacations — сверка с перебором по дням', () => {
  it('совпадает на тысячах случайных сценариев', () => {
    const rand = lcg(42);
    const base = '2026-09-01';
    for (let n = 0; n < 5000; n++) {
      const today = addDays(base, 5 + rand(50));
      const vacations = randomVacations(rand, base, today);
      const anchor = addDays(base, rand(diffDays(base, today) + 1));
      const interval = [1, 3, 7, 16, 35][rand(5)];
      const expected = bruteForce(anchor, interval, vacations, today);
      const actual = shiftForVacations(anchor, addDays(anchor, interval), vacations, today);
      if (actual !== expected) {
        throw new Error(`anchor=${anchor} interval=${interval} today=${today} vacations=${JSON.stringify(vacations.map((v) => [v.start, v.end]))}: ${actual} ≠ ${expected}`);
      }
    }
    expect(true).toBe(true);
  });
});

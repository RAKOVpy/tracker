import { describe, expect, it } from 'vitest';
import { formatAmount } from './pace';

describe('formatAmount', () => {
  it.each([
    [1, 'часов', '1 час'],
    [3, 'часов', '3 часа'],
    [0.5, 'часов', '0,5 часа'],
    [1, 'тренировок', '1 тренировка'],
    [12, 'тренировок', '12 тренировок'],
    [21, 'минут', '21 минута'],
    [15.33, 'стр.', '15 стр.'],
    [1.25, 'км', '1,3 км'],
    [4, 'подходов', '4 подходов'], // неизвестная единица — как есть
  ])('%d %s → %s', (value, unit, expected) => {
    expect(formatAmount(value, unit)).toBe(expected);
  });
});

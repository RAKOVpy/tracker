import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, formatRelative, todayIso } from './dates';
import { plural } from './format';

describe('dates', () => {
  it('todayIso берёт локальную дату', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('addDays переходит через границы месяца и года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths не перескакивает в следующий месяц', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15');
  });

  it('diffDays не ломается на переходе на летнее время', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-30', '2026-10-01')).toBe(-29);
  });

  it('formatRelative', () => {
    expect(formatRelative('2026-10-05', '2026-10-05')).toBe('сегодня');
    expect(formatRelative('2026-10-04', '2026-10-05')).toBe('вчера');
  });
});

describe('plural', () => {
  const forms: [string, string, string] = ['день', 'дня', 'дней'];
  it.each([
    [1, 'день'],
    [2, 'дня'],
    [5, 'дней'],
    [11, 'дней'],
    [21, 'день'],
    [22, 'дня'],
    [112, 'дней'],
  ])('%i → %s', (n, expected) => {
    expect(plural(n, forms)).toBe(expected);
  });
});

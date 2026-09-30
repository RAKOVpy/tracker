import { describe, expect, it } from 'vitest';
import { formatVacation } from './vacationText';

describe('formatVacation', () => {
  it.each([
    [{ start: '2026-10-01', end: '2026-10-14' }, '1–14 окт'],
    [{ start: '2026-09-28', end: '2026-10-05' }, '28 сент – 5 окт'],
    [{ start: '2026-10-01', end: '2026-10-01' }, '1 окт'],
    [{ start: '2026-10-01', end: null }, 'с 1 окт'],
  ])('%j → %s', (vacation, text) => {
    expect(formatVacation(vacation, '2026-09-29')).toBe(text);
  });

  it('добавляет год, если отпуск не в текущем году', () => {
    expect(formatVacation({ start: '2025-10-01', end: '2025-10-14' }, '2026-09-29')).toBe('1–14 окт 2025');
    expect(formatVacation({ start: '2027-01-02', end: '2027-01-02' }, '2026-09-29')).toBe('2 янв 2027');
    expect(formatVacation({ start: '2026-12-28', end: '2027-01-05' }, '2026-09-29')).toBe('28 дек – 5 янв 2027');
  });
});

import type { Vacation } from '../domain/types';
import { formatShort } from '../lib/dates';

/** «1–14 окт», «28 сент – 5 окт», «с 1 окт». */
export function formatVacation(vacation: Pick<Vacation, 'start' | 'end'>): string {
  if (vacation.end === null) return `с ${formatShort(vacation.start)}`;
  if (vacation.start === vacation.end) return formatShort(vacation.start);
  const start = formatShort(vacation.start);
  const end = formatShort(vacation.end);
  const [startDay, startMonth] = [start.split(' ')[0], start.slice(start.indexOf(' ') + 1)];
  return end.endsWith(` ${startMonth}`) ? `${startDay}–${end}` : `${start} – ${end}`;
}

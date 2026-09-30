import type { Vacation } from '../domain/types';
import { formatShort, type IsoDate } from '../lib/dates';

/** «1–14 окт», «28 сент – 5 окт», «с 1 окт»; с `today` — год, если отпуск не в текущем году: «1–14 окт 2025». */
export function formatVacation(vacation: Pick<Vacation, 'start' | 'end'>, today?: IsoDate): string {
  const year = (vacation.end ?? vacation.start).slice(0, 4);
  const suffix = today && year !== today.slice(0, 4) ? ` ${year}` : '';
  if (vacation.end === null) return `с ${formatShort(vacation.start)}${suffix}`;
  if (vacation.start === vacation.end) return `${formatShort(vacation.start)}${suffix}`;
  const start = formatShort(vacation.start);
  const end = formatShort(vacation.end);
  const [startDay, startMonth] = [start.split(' ')[0], start.slice(start.indexOf(' ') + 1)];
  const sameMonth = end.endsWith(` ${startMonth}`) && vacation.start.slice(0, 4) === vacation.end.slice(0, 4);
  return `${sameMonth ? `${startDay}–${end}` : `${start} – ${end}`}${suffix}`;
}

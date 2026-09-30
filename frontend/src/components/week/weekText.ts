import { addDays, formatShort, type IsoDate } from '../../lib/dates';

/** «21–27 сент» или «28 сент – 4 окт», если неделя на стыке месяцев. */
export function weekRange(start: IsoDate): string {
  const end = addDays(start, 6);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}–${formatShort(end)}`;
  return `${formatShort(start)} – ${formatShort(end)}`;
}

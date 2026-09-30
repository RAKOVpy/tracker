import type { DeadlineSource } from '../../domain/projects';
import { URGENT_DAYS } from '../../domain/tasks';
import { diffDays, formatShort, formatWeekday, type IsoDate } from '../../lib/dates';

export interface DateTag {
  text: string;
  tone?: 'bad' | 'warn';
}

/** Срок, взятый у вехи или проекта, подписан, чей он: «срок вехи сегодня», «проект до 16 окт». */
const WORDS: Record<DeadlineSource | 'own', { term: string; until: string }> = {
  own: { term: 'срок', until: 'до' },
  milestone: { term: 'срок вехи', until: 'веха до' },
  project: { term: 'срок проекта', until: 'проект до' },
};

/** «срок прошёл 2 окт», «срок сегодня», «срок завтра», «до пт», «до 16 окт». */
export function deadlineTag(deadline: IsoDate, today: IsoDate, from: DeadlineSource | null = null): DateTag {
  const { term, until } = WORDS[from ?? 'own'];
  const days = diffDays(today, deadline);
  if (days < 0) return { text: `${term} прошёл ${formatShort(deadline)}`, tone: 'bad' };
  if (days === 0) return { text: `${term} сегодня`, tone: 'warn' };
  if (days === 1) return { text: `${term} завтра`, tone: 'warn' };
  const text = days < 7 ? `${until} ${formatWeekday(deadline)}` : `${until} ${formatShort(deadline)}`;
  return days <= URGENT_DAYS ? { text, tone: 'warn' } : { text };
}

/** Когда делаю: «завтра», «ср, 9 окт», «16 окт»; прошедший план — «перенесено с пн». Сегодня — null. */
export function planTag(plannedDate: IsoDate, today: IsoDate): string | null {
  const days = diffDays(today, plannedDate);
  if (days === 0) return null;
  if (days < 0) return `перенесено с ${days > -7 ? formatWeekday(plannedDate) : formatShort(plannedDate)}`;
  if (days === 1) return 'завтра';
  if (days < 7) return `${formatWeekday(plannedDate)}, ${formatShort(plannedDate)}`;
  return formatShort(plannedDate);
}

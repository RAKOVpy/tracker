import { X } from 'lucide-react';
import { useDeleteEntry } from '../api/hooks';
import type { Goal, ProgressEntry } from '../domain/types';
import { formatRelative, formatWeekday, type IsoDate } from '../lib/dates';
import { formatAmount } from './pace';

interface Props {
  goal: Goal;
  entries: ProgressEntry[];
  today: IsoDate;
}

export function EntryHistory({ goal, entries, today }: Props) {
  const deleteEntry = useDeleteEntry();

  if (entries.length === 0) {
    return <p className="muted">Записей пока нет. Отметьте первый прогресс выше.</p>;
  }

  const byDate = new Map<IsoDate, ProgressEntry[]>();
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const entry of sorted) {
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  }

  return (
    <div>
      {[...byDate].map(([date, dayEntries]) => {
        const total = dayEntries.reduce((sum, e) => sum + e.value, 0);
        return (
          <div className="history__day" key={date}>
            <div className="history__date">
              {formatRelative(date, today)} <span className="muted small">{formatWeekday(date)}</span>
            </div>
            <div>
              {dayEntries.map((entry) => (
                <div className="history__entry" key={entry.id}>
                  <strong>+{formatAmount(entry.value, goal.unit)}</strong>
                  <span className="spacer muted history__note">{entry.note}</span>
                  <button
                    className="icon-btn icon-btn--danger"
                    type="button"
                    title="Удалить запись"
                    aria-label="Удалить запись"
                    onClick={() => deleteEntry.mutate(entry.id)}
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ))}
              {dayEntries.length > 1 && <div className="muted small">Итого за день: {formatAmount(total, goal.unit)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

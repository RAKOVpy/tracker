import { useState, type FormEvent } from 'react';
import { useCreateEntry } from '../api/hooks';
import type { Goal } from '../domain/types';
import type { IsoDate } from '../lib/dates';
import { formatNumber } from '../lib/format';

interface Props {
  goal: Goal;
  today: IsoDate;
  /** Сколько осталось на сегодня — подставляется, если поле пустое. */
  suggested: number;
}

/** Быстрая запись прогресса за сегодня прямо с карточки. */
export function QuickLog({ goal, today, suggested }: Props) {
  const [raw, setRaw] = useState('');
  const createEntry = useCreateEntry();

  const typed = Number(raw.replace(',', '.'));
  const value = raw.trim() === '' ? suggested : typed;
  const isValid = Number.isFinite(value) && value > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    createEntry.mutate(
      { goalId: goal.id, date: today, value, note: '' },
      { onSuccess: () => setRaw('') },
    );
  }

  return (
    <form className="quick-log" onSubmit={submit}>
      <input
        className="input"
        inputMode="decimal"
        placeholder={suggested > 0 ? formatNumber(suggested) : 'ещё'}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        aria-label={`Сколько сделано сегодня, ${goal.unit}`}
      />
      <span className="muted small">{goal.unit}</span>
      <button className="btn btn--primary btn--sm" type="submit" disabled={!isValid || createEntry.isPending}>
        + Записать
      </button>
    </form>
  );
}

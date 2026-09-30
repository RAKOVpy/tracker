import { useState, type FormEvent } from 'react';
import { useCreateEntry } from '../api/hooks';
import type { Goal } from '../domain/types';
import type { IsoDate } from '../lib/dates';
import { formatNumber } from '../lib/format';

interface Props {
  goal: Goal;
  today: IsoDate;
  /** С какой даты открывается форма; по умолчанию — сегодня. */
  defaultDate?: IsoDate;
  /** Подставляется, если поле пустое: у привычки — норма за день. */
  suggested?: number;
}

/** Запись прогресса за любой прошедший день — если забыл отметить вчера. */
export function EntryForm({ goal, today, defaultDate = today, suggested }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const createEntry = useCreateEntry();

  const value = raw.trim() === '' && suggested ? suggested : Number(raw.replace(',', '.'));
  const isValid = Number.isFinite(value) && value > 0 && date >= goal.startDate && date <= today;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    createEntry.mutate(
      { goalId: goal.id, date, value, note: note.trim() },
      {
        onSuccess: () => {
          setRaw('');
          setNote('');
        },
      },
    );
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Дата</span>
        <input
          className="input"
          type="date"
          value={date}
          min={goal.startDate}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Сделано</span>
        <input
          className="input"
          inputMode="decimal"
          placeholder={suggested ? formatNumber(suggested) : goal.unit}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          aria-label={`Сделано, ${goal.unit}`}
        />
      </label>
      <label className="field entry-form__note">
        <span className="field__label">Комментарий</span>
        <input className="input" placeholder="Необязательно" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn btn--primary entry-form__submit" type="submit" disabled={!isValid || createEntry.isPending}>
        Добавить
      </button>
    </form>
  );
}

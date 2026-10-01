import { Plus } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useToggleHabit } from '../../api/hooks';
import type { HabitGoal } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';

interface Props {
  goal: HabitGoal;
  today: IsoDate;
  autoFocus?: boolean;
  /** Запись добавлена. */
  onAdded?: () => void;
  /** Есть — у формы кнопка «Отмена», Escape закрывает её. */
  onCancel?: () => void;
}

/**
 * Часть нормы за сегодня — без выбора даты: «60 отжиманий» набираются за день подходами по 20.
 * Каждый подход — своя запись, день засчитывается, когда сумма дошла до нормы.
 */
export function HabitAddForm({ goal, today, autoFocus, onAdded, onCancel }: Props) {
  const id = useId();
  const toggle = useToggleHabit();
  const [raw, setRaw] = useState('');
  const value = Number(raw.replace(',', '.'));
  const isValid = raw.trim() !== '' && Number.isFinite(value) && value > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    toggle.mutate({ goal, date: today, value });
    setRaw('');
    onAdded?.();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form className="habit-add" onSubmit={submit} onKeyDown={onKeyDown}>
      <label className="habit-add__label" htmlFor={id}>
        Сделано сейчас
      </label>
      <span className="habit-add__amount">
        <input
          id={id}
          className="input habit-add__input"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <span className="habit-add__unit">{goal.unit}</span>
      </span>
      <span className="habit-add__actions">
        <button className="btn btn--sm" type="submit" disabled={!isValid}>
          <Plus size={14} strokeWidth={2.5} aria-hidden /> Добавить
        </button>
        {onCancel && (
          <button className="btn btn--sm btn--ghost" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </span>
    </form>
  );
}

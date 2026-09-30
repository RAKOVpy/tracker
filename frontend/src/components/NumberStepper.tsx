import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

interface Props {
  id: string;
  value: number;
  min: number;
  max: number;
  /** Подпись для кнопок: «Уменьшить: повторений в день». */
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/**
 * Целое число с кнопками − и +. Введённое вручную применяется при уходе из поля или по Enter;
 * Enter внутри формы её не отправляет — иначе форма ушла бы со старым числом.
 */
export function NumberStepper({ id, value, min, max, label, disabled, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    setDraft(null);
    const parsed = Math.round(Number(raw.replace(',', '.')));
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== value) onChange(next);
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="icon-btn"
        aria-label={`Уменьшить: ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} aria-hidden />
      </button>
      <input
        id={id}
        className="input stepper__input num"
        inputMode="numeric"
        value={draft ?? String(value)}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <button
        type="button"
        className="icon-btn"
        aria-label={`Увеличить: ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { AREA_COLORS, AREA_ICONS } from '../domain/meta';
import type { AreaColor, AreaInput } from '../domain/types';
import { AREA_ICON_COMPONENTS, AREA_ICON_LABELS } from './areaIcons';

const COLOR_LABELS: Record<AreaColor, string> = {
  clay: 'Глина',
  ochre: 'Охра',
  sage: 'Шалфей',
  teal: 'Бирюза',
  slate: 'Сланец',
  plum: 'Слива',
  rose: 'Роза',
  stone: 'Камень',
};

interface Props {
  initial: AreaInput;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (input: AreaInput) => void;
  onCancel: () => void;
}

export function AreaEditor({ initial, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<AreaInput>(initial);
  const [submitted, setSubmitted] = useState(false);
  const nameError = values.name.trim() ? null : 'Введите название сферы';

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (nameError) return;
    onSubmit({ ...values, name: values.name.trim() });
  }

  return (
    <form className={`area-editor tone-${values.color}`} onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="area-name">
          Название
        </label>
        <input
          id="area-name"
          className="input"
          placeholder="Например: Здоровье"
          value={values.name}
          maxLength={40}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          aria-invalid={submitted && Boolean(nameError)}
          autoFocus
        />
        {submitted && nameError && <span className="field__error">{nameError}</span>}
      </div>

      <div className="field">
        <span className="field__label" id="area-color-label">
          Цвет
        </span>
        <div className="swatches" role="group" aria-labelledby="area-color-label">
          {AREA_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch tone-${color}`}
              aria-pressed={values.color === color}
              aria-label={COLOR_LABELS[color]}
              title={COLOR_LABELS[color]}
              onClick={() => setValues((v) => ({ ...v, color }))}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="area-icon-label">
          Иконка
        </span>
        <div className="icon-picker" role="group" aria-labelledby="area-icon-label">
          {AREA_ICONS.map((icon) => {
            const Icon = AREA_ICON_COMPONENTS[icon];
            return (
              <button
                key={icon}
                type="button"
                className="icon-option"
                aria-pressed={values.icon === icon}
                aria-label={AREA_ICON_LABELS[icon]}
                title={AREA_ICON_LABELS[icon]}
                onClick={() => setValues((v) => ({ ...v, icon }))}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div className="row">
        <button className="btn btn--primary btn--sm" type="submit" disabled={isSubmitting}>
          {submitLabel}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

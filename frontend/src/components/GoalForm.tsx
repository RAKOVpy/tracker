import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LONG_TERM_DAYS, PRIORITIES, PRIORITY_ORDER, UNIT_SUGGESTIONS } from '../domain/meta';
import { roundUpNorm } from '../domain/progress';
import type { Area, GoalInput } from '../domain/types';
import { addDays, addMonths, diffDays, todayIso } from '../lib/dates';
import { formatDays } from '../lib/format';
import { AREA_ICON_COMPONENTS } from './areaIcons';
import { formatAmount } from './pace';

interface Props {
  areas: Area[];
  initial?: GoalInput;
  /** Сфера по умолчанию для новой цели (например, из фильтра на странице целей). */
  defaultAreaId?: string | null;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (input: GoalInput) => void;
  onCancel: () => void;
}

type Errors = Partial<Record<'title' | 'targetValue' | 'unit' | 'deadline', string>>;

const QUICK_UNITS = ['стр.', 'минут', 'часов', 'уроков', 'тренировок', 'км', 'раз'];

function emptyGoal(areaId: string | null): GoalInput {
  const today = todayIso();
  return {
    title: '',
    description: '',
    areaId,
    unit: '',
    targetValue: 0,
    startDate: today,
    deadline: addDays(addMonths(today, 1), -1),
    priority: 'medium',
  };
}

const DEADLINE_PRESETS: { label: string; apply: (start: string) => string }[] = [
  { label: 'Неделя', apply: (s) => addDays(s, 6) },
  { label: 'Месяц', apply: (s) => addDays(addMonths(s, 1), -1) },
  { label: '3 месяца', apply: (s) => addDays(addMonths(s, 3), -1) },
  { label: 'Полгода', apply: (s) => addDays(addMonths(s, 6), -1) },
  { label: 'Год', apply: (s) => addDays(addMonths(s, 12), -1) },
];

export function GoalForm({ areas, initial, defaultAreaId = null, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const start = initial ?? emptyGoal(defaultAreaId);
  const [values, setValues] = useState<GoalInput>(start);
  const [target, setTarget] = useState(start.targetValue > 0 ? String(start.targetValue) : '');
  const [submitted, setSubmitted] = useState(false);

  const targetValue = Number(target.replace(',', '.'));
  const totalDays = diffDays(values.startDate, values.deadline) + 1;

  const errors: Errors = {};
  if (!values.title.trim()) errors.title = 'Как называется цель?';
  if (!(targetValue > 0)) errors.targetValue = 'Укажите число больше нуля';
  if (!values.unit.trim()) errors.unit = 'В чём измерять прогресс?';
  if (totalDays < 1) errors.deadline = 'Срок не может быть раньше даты начала';
  const isValid = Object.keys(errors).length === 0;
  const shownErrors = submitted ? errors : {};

  function set<K extends keyof GoalInput>(key: K, value: GoalInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    onSubmit({
      ...values,
      title: values.title.trim(),
      unit: values.unit.trim(),
      description: values.description.trim(),
      targetValue,
    });
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="goal-title">
          Цель
        </label>
        <input
          id="goal-title"
          className="input"
          placeholder="Например: прочитать «Мастер и Маргарита»"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={Boolean(shownErrors.title)}
          autoFocus
        />
        {shownErrors.title && <span className="field__error">{shownErrors.title}</span>}
      </div>

      <div className="field">
        <span className="field__label" id="goal-area-label">
          Сфера
        </span>
        <div className="segmented" role="group" aria-labelledby="goal-area-label">
          {areas.map((area) => {
            const Icon = AREA_ICON_COMPONENTS[area.icon];
            return (
              <button
                key={area.id}
                type="button"
                className={`chip chip--tone tone-${area.color}`}
                aria-pressed={values.areaId === area.id}
                onClick={() => set('areaId', area.id)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden /> {area.name}
              </button>
            );
          })}
          <button type="button" className="chip" aria-pressed={values.areaId === null} onClick={() => set('areaId', null)}>
            Без сферы
          </button>
        </div>
        <span className="field__hint">
          Сферы настраиваются в <Link to="/settings">настройках</Link>.
        </span>
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="goal-target">
            Сколько нужно сделать
          </label>
          <input
            id="goal-target"
            className="input"
            inputMode="decimal"
            placeholder="320"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={Boolean(shownErrors.targetValue)}
          />
          {shownErrors.targetValue && <span className="field__error">{shownErrors.targetValue}</span>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="goal-unit">
            В чём измерять
          </label>
          <input
            id="goal-unit"
            className="input"
            list="unit-suggestions"
            placeholder="стр., минут, км…"
            value={values.unit}
            onChange={(e) => set('unit', e.target.value)}
            aria-invalid={Boolean(shownErrors.unit)}
          />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {shownErrors.unit && <span className="field__error">{shownErrors.unit}</span>}
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Быстрый выбор единицы">
        {QUICK_UNITS.map((unit) => (
          <button
            key={unit}
            type="button"
            className="chip"
            aria-pressed={values.unit === unit}
            onClick={() => set('unit', unit)}
          >
            {unit}
          </button>
        ))}
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="goal-start">
            Начало
          </label>
          <input
            id="goal-start"
            className="input"
            type="date"
            value={values.startDate}
            onChange={(e) => e.target.value && set('startDate', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="goal-deadline">
            Срок
          </label>
          <input
            id="goal-deadline"
            className="input"
            type="date"
            value={values.deadline}
            min={values.startDate}
            onChange={(e) => e.target.value && set('deadline', e.target.value)}
            aria-invalid={Boolean(shownErrors.deadline)}
          />
          {shownErrors.deadline && <span className="field__error">{shownErrors.deadline}</span>}
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Быстрый выбор срока">
        {DEADLINE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip"
            aria-pressed={values.deadline === preset.apply(values.startDate)}
            onClick={() => set('deadline', preset.apply(values.startDate))}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="field">
        <span className="field__label" id="goal-priority-label">
          Приоритет
        </span>
        <div className="segmented" role="group" aria-labelledby="goal-priority-label">
          {PRIORITY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={values.priority === key}
              onClick={() => set('priority', key)}
            >
              {PRIORITIES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="goal-description">
          Заметки
        </label>
        <textarea
          id="goal-description"
          className="textarea"
          placeholder="Зачем эта цель и как вы собираетесь её достигать"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      {targetValue > 0 && totalDays >= 1 && values.unit.trim() && (
        <div className="preview">
          <strong>≈ {formatAmount(roundUpNorm(targetValue / totalDays), values.unit.trim())} в день</strong>
          <span className="muted">
            {' '}
            · {formatDays(totalDays)} · {totalDays > LONG_TERM_DAYS ? 'долгосрочная' : 'краткосрочная'} цель
          </span>
        </div>
      )}

      <div className="row">
        <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
          {submitLabel}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

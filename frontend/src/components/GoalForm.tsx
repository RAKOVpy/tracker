import { useState, type FormEvent } from 'react';
import { CATEGORIES, CATEGORY_ORDER, LONG_TERM_DAYS, PRIORITIES, PRIORITY_ORDER } from '../domain/meta';
import type { Category, GoalInput, Priority } from '../domain/types';
import { addDays, addMonths, diffDays, todayIso } from '../lib/dates';
import { formatDays } from '../lib/format';
import { formatAmount } from './pace';

interface Props {
  initial?: GoalInput;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (input: GoalInput) => void;
  onCancel: () => void;
}

type Errors = Partial<Record<'title' | 'targetValue' | 'unit' | 'deadline', string>>;

function emptyGoal(): GoalInput {
  const today = todayIso();
  return {
    title: '',
    description: '',
    category: 'reading',
    unit: CATEGORIES.reading.units[0],
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

export function GoalForm({ initial, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const start = initial ?? emptyGoal();
  const [values, setValues] = useState<GoalInput>(start);
  const [target, setTarget] = useState(start.targetValue > 0 ? String(start.targetValue) : '');
  const [submitted, setSubmitted] = useState(false);

  const targetValue = Number(target.replace(',', '.'));
  const totalDays = diffDays(values.startDate, values.deadline) + 1;

  const errors: Errors = {};
  if (!values.title.trim()) errors.title = 'Как называется цель?';
  if (!(targetValue > 0)) errors.targetValue = 'Укажите число больше нуля';
  if (!values.unit.trim()) errors.unit = 'Укажите единицу измерения';
  if (totalDays < 1) errors.deadline = 'Дедлайн не может быть раньше даты старта';
  const isValid = Object.keys(errors).length === 0;
  const shownErrors = submitted ? errors : {};

  function set<K extends keyof GoalInput>(key: K, value: GoalInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function changeCategory(category: Category) {
    setValues((prev) => {
      const prevUnits = CATEGORIES[prev.category].units;
      const keepUnit = prev.unit.trim() !== '' && !prevUnits.includes(prev.unit);
      return { ...prev, category, unit: keepUnit ? prev.unit : CATEGORIES[category].units[0] };
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    onSubmit({ ...values, title: values.title.trim(), unit: values.unit.trim(), description: values.description.trim(), targetValue });
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <label className="field">
        <span className="field__label">Цель</span>
        <input
          className="input"
          placeholder="Например: прочитать «Мастер и Маргарита»"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={Boolean(shownErrors.title)}
          autoFocus
        />
        {shownErrors.title && <span className="field__error">{shownErrors.title}</span>}
      </label>

      <div className="field">
        <span className="field__label">Категория</span>
        <div className="segmented">
          {CATEGORY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="segmented__item"
              aria-pressed={values.category === key}
              onClick={() => changeCategory(key)}
            >
              {CATEGORIES[key].icon} {CATEGORIES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Сколько нужно сделать</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="320"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={Boolean(shownErrors.targetValue)}
          />
          {shownErrors.targetValue && <span className="field__error">{shownErrors.targetValue}</span>}
        </label>
        <label className="field">
          <span className="field__label">Единица измерения</span>
          <input
            className="input"
            list="unit-suggestions"
            value={values.unit}
            onChange={(e) => set('unit', e.target.value)}
            aria-invalid={Boolean(shownErrors.unit)}
          />
          <datalist id="unit-suggestions">
            {CATEGORIES[values.category].units.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {shownErrors.unit && <span className="field__error">{shownErrors.unit}</span>}
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Начало</span>
          <input
            className="input"
            type="date"
            value={values.startDate}
            onChange={(e) => e.target.value && set('startDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Дедлайн</span>
          <input
            className="input"
            type="date"
            value={values.deadline}
            min={values.startDate}
            onChange={(e) => e.target.value && set('deadline', e.target.value)}
            aria-invalid={Boolean(shownErrors.deadline)}
          />
          {shownErrors.deadline && <span className="field__error">{shownErrors.deadline}</span>}
        </label>
      </div>
      <div className="segmented" aria-label="Быстрый выбор срока">
        {DEADLINE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="segmented__item"
            aria-pressed={values.deadline === preset.apply(values.startDate)}
            onClick={() => set('deadline', preset.apply(values.startDate))}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="field">
        <span className="field__label">Приоритет</span>
        <div className="segmented">
          {PRIORITY_ORDER.map((key: Priority) => (
            <button
              key={key}
              type="button"
              className="segmented__item"
              aria-pressed={values.priority === key}
              onClick={() => set('priority', key)}
            >
              {PRIORITIES[key].label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field__label">Заметки</span>
        <textarea
          className="textarea"
          placeholder="Зачем эта цель, как планируете её достигать"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      {targetValue > 0 && totalDays >= 1 && (
        <div className="preview">
          {formatDays(totalDays)} · ≈ {formatAmount(targetValue / totalDays, values.unit)} в день ·{' '}
          {totalDays > LONG_TERM_DAYS ? 'долгосрочная' : 'краткосрочная'}
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

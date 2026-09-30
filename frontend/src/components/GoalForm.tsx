import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isDaily } from '../domain/habits';
import { LONG_TERM_DAYS, PRIORITIES, PRIORITY_ORDER, UNIT_SUGGESTIONS } from '../domain/meta';
import { roundUpNorm } from '../domain/progress';
import type { Area, GoalInput, GoalKind, Priority } from '../domain/types';
import { addDays, addMonths, diffDays, todayIso, type IsoDate } from '../lib/dates';
import { formatDays, plural } from '../lib/format';
import { AREA_ICON_COMPONENTS } from './areaIcons';
import { scheduleText } from './habits/habitText';
import { formatAmount } from './pace';

interface Props {
  areas: Area[];
  initial?: GoalInput;
  /** Сфера по умолчанию для новой цели (например, из фильтра на странице целей). */
  defaultAreaId?: string | null;
  /** Вид новой цели; у существующей вид не меняется, и переключателя нет. */
  defaultKind?: GoalKind;
  /** Переключили вид — например, чтобы сменить заголовок страницы. */
  onKindChange?: (kind: GoalKind) => void;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (input: GoalInput) => void;
  onCancel: () => void;
}

type Errors = Partial<Record<'title' | 'targetValue' | 'unit' | 'deadline', string>>;

/** Поля формы: у цели к сроку и у привычки часть общая, срок и частота — свои. */
interface Values {
  kind: GoalKind;
  title: string;
  description: string;
  areaId: string | null;
  unit: string;
  startDate: IsoDate;
  deadline: IsoDate;
  daysPerWeek: number;
  priority: Priority;
}

const QUICK_UNITS = ['стр.', 'минут', 'часов', 'уроков', 'тренировок', 'км', 'раз'];
/** Привычка по умолчанию — просто отметка: «1 раз» за день. */
const HABIT_TARGET = '1';
const HABIT_UNIT = 'раз';

function initialValues(initial: GoalInput | undefined, areaId: string | null, kind: GoalKind): Values {
  const today = todayIso();
  if (initial) {
    return {
      ...initial,
      deadline: initial.deadline ?? addDays(addMonths(initial.startDate, 1), -1),
      daysPerWeek: initial.daysPerWeek ?? 7,
    };
  }
  return {
    kind,
    title: '',
    description: '',
    areaId,
    unit: kind === 'habit' ? HABIT_UNIT : '',
    startDate: today,
    deadline: addDays(addMonths(today, 1), -1),
    daysPerWeek: 7,
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

const FREQUENCIES = [7, 1, 2, 3, 4, 5, 6];

export function GoalForm({
  areas,
  initial,
  defaultAreaId = null,
  defaultKind = 'target',
  onKindChange,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<Values>(() => initialValues(initial, defaultAreaId, defaultKind));
  const [target, setTarget] = useState(() => {
    if (initial) return String(initial.targetValue);
    return defaultKind === 'habit' ? HABIT_TARGET : '';
  });
  const [submitted, setSubmitted] = useState(false);

  const isHabit = values.kind === 'habit';
  const targetValue = Number(target.replace(',', '.'));
  const totalDays = diffDays(values.startDate, values.deadline) + 1;

  const errors: Errors = {};
  if (!values.title.trim()) errors.title = isHabit ? 'Как называется привычка?' : 'Как называется цель?';
  if (!(targetValue > 0)) errors.targetValue = 'Укажите число больше нуля';
  if (!values.unit.trim()) errors.unit = isHabit ? 'В чём отмечать: минут, раз, страниц…' : 'В чём измерять прогресс?';
  if (!isHabit && totalDays < 1) errors.deadline = 'Срок не может быть раньше даты начала';
  const isValid = Object.keys(errors).length === 0;
  const shownErrors = submitted ? errors : {};

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Новая привычка — сразу «1 раз», пока норму не ввели; обратно к цели — поля снова пустые. */
  function switchKind(kind: GoalKind) {
    if (kind === values.kind) return;
    onKindChange?.(kind);
    const untouched = kind === 'habit' ? target === '' && values.unit === '' : target === HABIT_TARGET && values.unit === HABIT_UNIT;
    if (untouched) {
      setTarget(kind === 'habit' ? HABIT_TARGET : '');
      setValues((prev) => ({ ...prev, kind, unit: kind === 'habit' ? HABIT_UNIT : '' }));
    } else {
      set('kind', kind);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    const common = {
      title: values.title.trim(),
      description: values.description.trim(),
      areaId: values.areaId,
      unit: values.unit.trim(),
      targetValue,
      startDate: values.startDate,
      priority: values.priority,
    };
    onSubmit(
      isHabit
        ? { ...common, kind: 'habit', deadline: null, daysPerWeek: values.daysPerWeek }
        : { ...common, kind: 'target', deadline: values.deadline, daysPerWeek: null },
    );
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      {!initial && (
        <div className="segmented" role="group" aria-label="Что создать">
          <button type="button" className="chip" aria-pressed={!isHabit} onClick={() => switchKind('target')}>
            Цель к сроку
          </button>
          <button type="button" className="chip" aria-pressed={isHabit} onClick={() => switchKind('habit')}>
            Привычка
          </button>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="goal-title">
          {isHabit ? 'Привычка' : 'Цель'}
        </label>
        <input
          id="goal-title"
          className="input"
          placeholder={isHabit ? 'Например: английский, зал, растяжка' : 'Например: прочитать «Мастер и Маргарита»'}
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

      {isHabit && (
        <div className="field">
          <span className="field__label" id="goal-frequency-label">
            Как часто
          </span>
          <div className="segmented" role="group" aria-labelledby="goal-frequency-label">
            {FREQUENCIES.map((days) => (
              <button
                key={days}
                type="button"
                className="chip"
                aria-pressed={values.daysPerWeek === days}
                onClick={() => set('daysPerWeek', days)}
              >
                {days === 7 ? 'Каждый день' : `${days} ${plural(days, ['раз', 'раза', 'раз'])}`}
              </button>
            ))}
          </div>
          <span className="field__hint">
            {isDaily(values) ? 'Отмечать каждый день.' : 'В неделю, в любые дни: пропущенный понедельник можно наверстать во вторник.'}
          </span>
        </div>
      )}

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="goal-target">
            {isHabit ? 'Сколько за раз' : 'Сколько нужно сделать'}
          </label>
          <input
            id="goal-target"
            className="input"
            inputMode="decimal"
            placeholder={isHabit ? '20' : '320'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={Boolean(shownErrors.targetValue)}
          />
          {shownErrors.targetValue ? (
            <span className="field__error">{shownErrors.targetValue}</span>
          ) : (
            isHabit && <span className="field__hint">Столько записывает одна отметка на «Сегодня».</span>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="goal-unit">
            {isHabit ? 'В чём' : 'В чём измерять'}
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
          <button key={unit} type="button" className="chip" aria-pressed={values.unit === unit} onClick={() => set('unit', unit)}>
            {unit}
          </button>
        ))}
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="goal-start">
            {isHabit ? 'С какого дня' : 'Начало'}
          </label>
          <input
            id="goal-start"
            className="input"
            type="date"
            value={values.startDate}
            onChange={(e) => e.target.value && set('startDate', e.target.value)}
          />
        </div>
        {!isHabit && (
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
        )}
      </div>
      {!isHabit && (
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
      )}

      <div className="field">
        <span className="field__label" id="goal-priority-label">
          Приоритет
        </span>
        <div className="segmented" role="group" aria-labelledby="goal-priority-label">
          {PRIORITY_ORDER.map((key) => (
            <button key={key} type="button" className="chip" aria-pressed={values.priority === key} onClick={() => set('priority', key)}>
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
          placeholder={isHabit ? 'Зачем эта привычка и как не забывать о ней' : 'Зачем эта цель и как вы собираетесь её достигать'}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      {isHabit
        ? targetValue > 0 &&
          values.unit.trim() && (
            <div className="preview">
              <strong>{capitalize(scheduleText({ ...values, targetValue, unit: values.unit.trim() }))}</strong>
              <span className="muted">
                {' '}
                · {isDaily(values) ? 'один пропуск в неделю серию не прерывает' : 'один пропуск за четыре недели серию не прерывает'}
              </span>
            </div>
          )
        : targetValue > 0 &&
          totalDays >= 1 &&
          values.unit.trim() && (
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

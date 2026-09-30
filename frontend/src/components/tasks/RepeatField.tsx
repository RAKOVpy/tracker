import {
  anchorRecurrence,
  describeRecurrence,
  isOccurrence,
  nextOccurrence,
  REPEAT_INTERVAL_MAX,
  REPEAT_UNIT_ORDER,
  REPEAT_UNITS,
  WEEKDAY_SHORT,
} from '../../domain/recurrence';
import type { Recurrence, RepeatUnit } from '../../domain/types';
import { formatShort, formatWeekday, weekdayIndex, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { NumberStepper } from '../NumberStepper';

interface Props {
  value: Recurrence | null;
  /** Даты задачи: от них идёт отсчёт повтора. */
  plannedDate: IsoDate | null;
  deadline: IsoDate | null;
  today: IsoDate;
  onChange: (value: Recurrence | null) => void;
}

const UNIT_WORDS: Record<RepeatUnit, [string, string, string]> = {
  day: ['день', 'дня', 'дней'],
  week: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
};

const dayText = (date: IsoDate) => `${formatWeekday(date)}, ${formatShort(date)}`;

/**
 * Повтор задачи: единица, шаг и дни недели. Отсчёт — от даты задачи, поэтому ниже сразу видно,
 * когда эта задача и когда появится следующая.
 */
export function RepeatField({ value, plannedDate, deadline, today, onChange }: Props) {
  const anchor = plannedDate ?? deadline;

  function chooseUnit(unit: RepeatUnit | null) {
    if (unit === null) return onChange(null);
    if (value?.unit === unit) return;
    onChange({
      unit,
      interval: 1,
      // По умолчанию — день недели задачи: «каждую неделю» от вс — каждое воскресенье.
      weekdays: unit === 'week' ? [weekdayIndex(anchor ?? today)] : [],
      start: anchor ?? today,
    });
  }

  function toggleDay(day: number) {
    if (!value) return;
    const has = value.weekdays.includes(day);
    // Хотя бы один день должен остаться.
    if (has && value.weekdays.length === 1) return;
    const weekdays = has ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  }

  let preview: string | null = null;
  if (value) {
    const settled = anchorRecurrence(value, { plannedDate, deadline }, today);
    const rule = settled.recurrence;
    const current = settled.plannedDate ?? settled.deadline!;
    const text = describeRecurrence(rule);
    preview = anchor
      ? isOccurrence(rule, current)
        ? `${text}: эта задача — ${dayText(current)}, следующая — ${dayText(nextOccurrence(rule, current))}.`
        : `Эта задача — ${dayText(current)}, дальше ${text}: ${dayText(nextOccurrence(rule, current))}.`
      : `${text}: первый раз — ${dayText(current)}.`;
    preview = preview[0].toUpperCase() + preview.slice(1);
  }

  return (
    <div className="field">
      <span className="field__label" id="task-repeat-label">
        Повтор
      </span>
      <div className="segmented" role="group" aria-labelledby="task-repeat-label">
        <button type="button" className="chip" aria-pressed={value === null} onClick={() => chooseUnit(null)}>
          Не повторять
        </button>
        {REPEAT_UNIT_ORDER.map((unit) => (
          <button key={unit} type="button" className="chip" aria-pressed={value?.unit === unit} onClick={() => chooseUnit(unit)}>
            {REPEAT_UNITS[unit]}
          </button>
        ))}
      </div>

      {value && (
        <div className="repeat">
          {value.unit === 'week' && (
            <div className="segmented repeat__days" role="group" aria-label="Дни недели">
              {WEEKDAY_SHORT.map((name, day) => (
                <button
                  key={name}
                  type="button"
                  className="chip repeat__day"
                  aria-pressed={value.weekdays.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="repeat__interval">
            <label htmlFor="task-repeat-interval" className="small">
              Раз в
            </label>
            <NumberStepper
              id="task-repeat-interval"
              value={value.interval}
              min={1}
              max={REPEAT_INTERVAL_MAX}
              label="шаг повтора"
              onChange={(interval) => onChange({ ...value, interval })}
            />
            <span className="small">{plural(value.interval, UNIT_WORDS[value.unit])}</span>
          </div>
          <p className="field__hint" aria-live="polite">
            {preview}
          </p>
        </div>
      )}
    </div>
  );
}

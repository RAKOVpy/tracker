import { Snowflake } from 'lucide-react';
import type { CalendarWeek, DayMark } from '../../domain/habits';
import { formatShort, formatWeekday } from '../../lib/dates';
import { formatNumber } from '../../lib/format';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const MARKS: Record<DayMark, string> = {
  done: 'сделано',
  partial: 'начато, меньше нормы',
  missed: 'пропуск',
  forgiven: 'пропуск, серия сохранена',
  empty: 'без отметки',
  vacation: 'отпуск',
  today: 'сегодня, ещё не отмечено',
  future: 'впереди',
  before: 'до старта',
};

interface Props {
  weeks: CalendarWeek[];
  unit: string;
  /** Ежедневная привычка — пропуски видны по дням; недельная — итог недели справа. */
  daily: boolean;
}

/** Недели привычки строками: дни с понедельника и итог недели «засчитано из нужного». */
export function HabitCalendar({ weeks, unit, daily }: Props) {
  return (
    <figure className="habit-calendar-wrap">
      <div className="habit-calendar" role="table" aria-label="Календарь привычки по неделям">
        <div className="habit-calendar__row habit-calendar__head" role="row">
          <span role="columnheader" aria-label="Неделя" />
          {WEEKDAYS.map((day) => (
            <span key={day} role="columnheader">
              {day}
            </span>
          ))}
          <span role="columnheader">итог</span>
        </div>
        {weeks.map((week) => {
          const kept = week.quota > 0 && week.done >= week.quota;
          return (
            <div className="habit-calendar__row" role="row" key={week.start}>
              <span role="rowheader" className="habit-calendar__date">
                {formatShort(week.start)}
              </span>
              {week.days.map((day) => {
                const label = `${formatWeekday(day.date)}, ${formatShort(day.date)}: ${MARKS[day.mark]}${day.value > 0 ? `, ${formatNumber(day.value)} ${unit}` : ''}`;
                return (
                  <span key={day.date} role="cell" className={`habit-day habit-day--${day.mark}`} title={label} aria-label={label}>
                    {day.mark === 'forgiven' && <Snowflake size={11} strokeWidth={2.2} aria-hidden />}
                  </span>
                );
              })}
              <span
                role="cell"
                className={kept ? 'habit-calendar__result habit-calendar__result--kept' : 'habit-calendar__result'}
                title={week.forgiven ? 'Неделя без одного раза — серия сохранена' : undefined}
              >
                {week.quota > 0 ? `${week.done}/${week.quota}` : '—'}
                {week.forgiven && <Snowflake size={11} strokeWidth={2.2} aria-label="серия сохранена" />}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="legend">
        <span>
          <span className="habit-swatch habit-day--done" />
          Сделано
        </span>
        <span>
          <span className="habit-swatch habit-day--partial" />
          Начато
        </span>
        {daily && (
          <span>
            <span className="habit-swatch habit-day--missed" />
            Пропуск
          </span>
        )}
        <span>
          <Snowflake size={12} strokeWidth={2.2} aria-hidden /> Серия сохранена
        </span>
        <span>
          <span className="habit-swatch habit-day--vacation" />
          Отпуск
        </span>
      </figcaption>
    </figure>
  );
}

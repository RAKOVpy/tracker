import { addDays, formatShort, formatWeekday, type IsoDate } from '../lib/dates';
import { formatNumber } from '../lib/format';

interface Props {
  dailyTotals: Map<IsoDate, number>;
  today: IsoDate;
  days?: number;
}

/** Последние N дней: закрашен — в этот день был прогресс. */
export function WeekDots({ dailyTotals, today, days = 7 }: Props) {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  return (
    <div className="week" aria-label={`Активность за последние ${days} дней`}>
      {dates.map((date) => {
        const value = dailyTotals.get(date) ?? 0;
        const classes = ['week__day'];
        if (value > 0) classes.push('week__day--done');
        if (date === today) classes.push('week__day--today');
        return (
          <span
            key={date}
            className={classes.join(' ')}
            title={`${formatWeekday(date)}, ${formatShort(date)}: ${value > 0 ? formatNumber(value) : '—'}`}
          />
        );
      })}
    </div>
  );
}

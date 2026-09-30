import { backlogClearedOn, type ForecastDay } from '../../domain/load';
import { formatShort, formatWeekday, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';

interface Props {
  forecast: ForecastDay[];
  budget: number;
  today: IsoDate;
}

function describe(day: ForecastDay, today: IsoDate): string {
  const date = day.date === today ? 'Сегодня' : formatShort(day.date);
  if (day.vacation) return `${date}: отпуск`;
  const parts = [`${date}: ${day.reviews} ${plural(day.reviews, ['повторение', 'повторения', 'повторений'])}`];
  if (day.done > 0) parts.push(`уже сделано ${day.done}`);
  if (day.carried > 0) parts.push(`${day.carried} перейдут на следующий день`);
  return parts.join(', ');
}

/** Нагрузка на две недели вперёд: столбик — повторения за день, пунктир — дневной лимит. */
export function LoadForecast({ forecast, budget, today }: Props) {
  const workDays = forecast.filter((d) => !d.vacation);
  const total = workDays.reduce((sum, d) => sum + d.reviews, 0);
  const average = workDays.length ? Math.round(total / workDays.length) : 0;
  const top = Math.max(budget, ...forecast.map((d) => d.reviews), 1);
  const pct = (value: number) => `${(value / top) * 100}%`;
  const backlog = forecast[0]?.carried > 0;
  const cleared = backlog ? backlogClearedOn(forecast) : null;

  return (
    <figure className="card forecast">
      <figcaption className="forecast__caption">
        <h2 className="section__title" style={{ margin: 0 }}>
          Нагрузка на 2 недели
        </h2>
        <p className="muted small">
          {total === 0
            ? 'В ближайшие две недели повторять нечего.'
            : `${total} ${plural(total, ['повторение', 'повторения', 'повторений'])}, в среднем ${average} в день при лимите ${budget}.`}{' '}
          {backlog &&
            (cleared
              ? `Перенесённое разберётся к ${formatShort(cleared)}.`
              : 'Перенесённое за две недели не разобрать — стоит поднять лимит.')}
        </p>
      </figcaption>

      <div className="forecast__plot" role="list" aria-label="Повторения по дням">
        <div className="forecast__budget" style={{ bottom: pct(budget) }} aria-hidden />
        {forecast.map((day) => (
          <div
            key={day.date}
            role="listitem"
            className={[
              'forecast__col',
              day.vacation && 'forecast__col--vacation',
              day.carried > 0 && 'forecast__col--full',
              day.date === today && 'forecast__col--today',
            ]
              .filter(Boolean)
              .join(' ')}
            title={describe(day, today)}
            aria-label={describe(day, today)}
          >
            {!day.vacation && day.reviews > 0 && (
              <>
                <span className="forecast__value num" style={{ bottom: `calc(${pct(day.reviews)} + 2px)` }} aria-hidden>
                  {day.reviews}
                </span>
                <span className="forecast__bar" style={{ height: pct(day.reviews) }} aria-hidden>
                  {day.done > 0 && <span className="forecast__done" style={{ height: `${(day.done / day.reviews) * 100}%` }} />}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="forecast__axis" aria-hidden>
        {forecast.map((day) => (
          <span key={day.date} className={day.date === today ? 'forecast__tick forecast__tick--today' : 'forecast__tick'}>
            <span>{day.date === today ? 'сег' : formatWeekday(day.date)}</span>
            <span className="num">{Number(day.date.slice(8))}</span>
          </span>
        ))}
      </div>

      <div className="legend small">
        <span>
          <span className="legend__swatch forecast__swatch" /> повторения
        </span>
        {forecast[0]?.done > 0 && (
          <span>
            <span className="legend__swatch forecast__swatch--done" /> сделано сегодня
          </span>
        )}
        <span>
          <span className="legend__swatch legend__swatch--plan" /> лимит {budget} в день
        </span>
        {forecast.some((d) => d.vacation) && (
          <span>
            <span className="legend__swatch forecast__swatch--vacation" /> отпуск
          </span>
        )}
      </div>
    </figure>
  );
}

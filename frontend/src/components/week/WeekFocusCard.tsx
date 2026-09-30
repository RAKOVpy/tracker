import { CalendarCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWeeklyReviews } from '../../api/hooks';
import { currentFocus, reviewReminder } from '../../domain/week';
import type { IsoDate } from '../../lib/dates';
import { FocusList } from './FocusList';
import { weekRange } from './weekText';

/**
 * «Сегодня»: фокус недели из прошлого обзора (пункты можно отмечать) и напоминание об обзоре
 * с пятницы по понедельник, пока неделю не подвели.
 */
export function WeekFocusCard({ today }: { today: IsoDate }) {
  const { data: reviews } = useWeeklyReviews();
  if (!reviews) return null;
  const focus = currentFocus(reviews, today);
  const reminder = reviewReminder(reviews, today);
  const hasFocus = focus !== null && focus.focus.length > 0;
  if (!hasFocus && !reminder) return null;

  return (
    <section className="card stack week-focus slot" aria-labelledby="week-focus">
      <div className="panel-head">
        <h2 className="section__title" id="week-focus" style={{ margin: 0 }}>
          {hasFocus ? 'Фокус недели' : 'Обзор недели'}
        </h2>
        {hasFocus && (
          <span className="muted small num">
            {focus.focus.filter((f) => f.done).length} из {focus.focus.length}
          </span>
        )}
      </div>
      {hasFocus && <FocusList review={focus} />}
      {reminder && (
        <div className="week-reminder">
          <CalendarCheck size={18} strokeWidth={1.8} aria-hidden />
          <span className="spacer small">
            {hasFocus ? 'Пора подвести итоги недели' : `Пора подвести итоги недели ${weekRange(reminder)}`}: разобрать входящие,
            посмотреть отстающие цели и выбрать фокус. Около 10 минут.
          </span>
          <Link className="btn btn--sm btn--primary" to="/week">
            Начать обзор
          </Link>
        </div>
      )}
    </section>
  );
}

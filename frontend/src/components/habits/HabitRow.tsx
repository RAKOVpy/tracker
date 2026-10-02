import { Check, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToggleHabit } from '../../api/hooks';
import type { CalendarWeek, HabitWithStats } from '../../domain/habits';
import type { Area } from '../../domain/types';
import { formatShort, formatWeekday, type IsoDate } from '../../lib/dates';
import { formatNumber } from '../../lib/format';
import { scheduleText, stateText, streakText } from './habitText';

/**
 * Отметка привычки за сегодня одним нажатием: записывает недостающее до нормы дня.
 * Повторное нажатие снимает отметку — записи за сегодня удаляются.
 */
export function HabitCheck({ item, today }: { item: HabitWithStats; today: IsoDate }) {
  const toggle = useToggleHabit();
  const { goal, stats } = item;
  const done = stats.todayDone;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Снять отметку за сегодня: ${goal.title}` : `Сделано сегодня: ${goal.title}`}
      className="task-check"
      disabled={goal.status === 'archived' || stats.state === 'upcoming'}
      onClick={() => toggle.mutate({ goal, date: today, value: done ? null : stats.todayLeft })}
    >
      <Check size={14} strokeWidth={3} aria-hidden />
    </button>
  );
}

const DAY_LABELS: Record<string, string> = {
  done: 'сделано',
  partial: 'начато',
  missed: 'пропуск',
  forgiven: 'пропуск, серия сохранена',
  empty: 'без отметки',
  vacation: 'отпуск',
  today: 'сегодня, ещё не отмечено',
  future: 'впереди',
  before: 'до старта',
};

/** Неделя с понедельника: закрашен — день засчитан. */
export function HabitWeekDots({ week, unit }: { week: CalendarWeek; unit: string }) {
  return (
    <div className="week habit-week" aria-label={`Эта неделя: ${week.done} из ${week.quota}`}>
      {week.days.map((day) => (
        <span
          key={day.date}
          className={`week__day week__day--${day.mark}`}
          title={`${formatWeekday(day.date)}, ${formatShort(day.date)}: ${DAY_LABELS[day.mark]}${day.value > 0 ? `, ${formatNumber(day.value)} ${unit}` : ''}`}
        />
      ))}
    </div>
  );
}

interface Props {
  item: HabitWithStats;
  today: IsoDate;
  /** Текущая неделя для точек справа; без неё точек нет. */
  week?: CalendarWeek;
  area?: Area;
}

export function HabitRow({ item, today, week, area }: Props) {
  const { goal, stats } = item;
  const archived = goal.status === 'archived';
  const state = archived ? { text: 'в архиве' } : stateText(goal, stats);
  return (
    <li className={stats.todayDone ? 'task-row habit-row habit-row--done' : 'task-row habit-row'}>
      <HabitCheck item={item} today={today} />
      <div className="task-row__main">
        <Link to={`/goals/${goal.id}`} className="task-row__title">
          {goal.title}
        </Link>
        <div className="task-row__meta">
          <span>{scheduleText(goal)}</span>
          {state && <span className={state.tone ? `tag tag--${state.tone}` : undefined}>{state.text}</span>}
          {!archived && stats.streak > 1 && (
            <span className="streak" title="Серия: один пропуск в неделю (у недельной привычки — один раз за четыре недели) её не прерывает">
              <Flame size={13} strokeWidth={2} aria-hidden /> {streakText(goal, stats.streak)}
            </span>
          )}
          {area && (
            <span className={`task-row__area tone-${area.color}`}>
              <span className="nav__dot" aria-hidden /> {area.name}
            </span>
          )}
        </div>
      </div>
      {week && !archived && <HabitWeekDots week={week} unit={goal.unit} />}
    </li>
  );
}

import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAreaMap } from '../../api/hooks';
import { compareHabits, habitCalendar, type HabitWithStats } from '../../domain/habits';
import type { Vacation } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { HabitRow } from './HabitRow';

interface Props {
  habits: HabitWithStats[];
  today: IsoDate;
  vacations: Vacation[];
}

/**
 * Привычки на «Сегодня»: отметка одним нажатием. Сначала нужные сегодня, потом те, что можно
 * сделать сегодня или в другой день недели, отмеченные — в конце.
 */
export function TodayHabits({ habits, today, vacations }: Props) {
  const areas = useAreaMap();
  const list = habits.filter((h) => h.goal.status === 'active' && h.stats.state !== 'upcoming').sort(compareHabits);
  if (list.length === 0) return null;
  const due = list.filter((h) => h.stats.state === 'due').length;

  return (
    <section className="section" aria-labelledby="today-habits">
      <div className="panel-head">
        <h2 className="section__title" id="today-habits" style={{ margin: 0 }}>
          Привычки {due > 0 && <span className="section__count">{due}</span>}
        </h2>
        <Link className="btn btn--sm btn--ghost" to="/goals/new?kind=habit">
          <Plus size={15} aria-hidden /> Привычка
        </Link>
      </div>
      <ul className="card task-list habit-list">
        {list.map((item) => (
          <HabitRow
            key={item.goal.id}
            item={item}
            today={today}
            week={habitCalendar(item, today, vacations, 1)[0]}
            area={item.goal.areaId ? areas.get(item.goal.areaId) : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

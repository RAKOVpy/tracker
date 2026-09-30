import { Plus, Repeat } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAreas, useAreaMap, useGoals, useVacations } from '../api/hooks';
import { GoalCard } from '../components/GoalCard';
import { HabitRow } from '../components/habits/HabitRow';
import { compareHabits, habitCalendar, type HabitWithStats } from '../domain/habits';
import { compareForToday, type GoalWithStats } from '../domain/progress';
import { ErrorState, LoadingState } from './states';

const NO_AREA = 'none';

interface Group {
  title: string;
  items: GoalWithStats[];
}

function groupForList(items: GoalWithStats[]): Group[] {
  const active: GoalWithStats[] = [];
  const upcoming: GoalWithStats[] = [];
  const achieved: GoalWithStats[] = [];
  const archived: GoalWithStats[] = [];
  for (const item of [...items].sort(compareForToday)) {
    if (item.goal.status === 'archived') archived.push(item);
    else if (item.stats.status === 'achieved') achieved.push(item);
    else if (item.stats.status === 'upcoming') upcoming.push(item);
    else active.push(item);
  }
  return [
    { title: 'В работе', items: active },
    { title: 'Запланированы', items: upcoming },
    { title: 'Достигнуты', items: achieved },
    { title: 'Архив', items: archived },
  ];
}

export function GoalsPage() {
  const { data, today, isLoading, error } = useGoals();
  const { data: areas = [] } = useAreas();
  const { data: vacations = [] } = useVacations();
  const areaMap = useAreaMap();
  const [params, setParams] = useSearchParams();
  const areaFilter = params.get('area');

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const inFilter = (item: { goal: { areaId: string | null } }) => {
    if (!areaFilter) return true;
    if (areaFilter === NO_AREA) return item.goal.areaId === null;
    return item.goal.areaId === areaFilter;
  };
  const groups = groupForList(data.targets.filter(inFilter)).filter((g) => g.items.length > 0);
  const habits = data.habits.filter(inFilter).sort(compareHabits);
  const activeHabits = habits.filter((h) => h.goal.status === 'active');
  const archivedHabits = habits.filter((h) => h.goal.status === 'archived');
  const all = [...data.targets, ...data.habits];
  const hasGoalsWithoutArea = all.some((item) => item.goal.areaId === null);
  const selectedArea = areaFilter ? areaMap.get(areaFilter) : undefined;
  const areaQuery = selectedArea ? `area=${selectedArea.id}` : '';

  function selectArea(id: string | null) {
    setParams(id ? { area: id } : {}, { replace: true });
  }

  const habitRows = (list: HabitWithStats[]) => (
    <ul className="card task-list habit-list">
      {list.map((item) => (
        <HabitRow
          key={item.goal.id}
          item={item}
          today={today}
          week={habitCalendar(item, today, vacations, 1)[0]}
          area={!selectedArea && item.goal.areaId ? areaMap.get(item.goal.areaId) : undefined}
        />
      ))}
    </ul>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">{selectedArea ? 'Сфера' : 'Цели и привычки'}</p>
          <h1>{selectedArea ? selectedArea.name : areaFilter === NO_AREA ? 'Без сферы' : 'Цели'}</h1>
        </div>
        <div className="row">
          <Link className="btn btn--sm" to={`/goals/new?kind=habit${areaQuery && `&${areaQuery}`}`}>
            <Repeat size={15} aria-hidden /> Привычка
          </Link>
          <Link className="btn btn--primary btn--sm" to={`/goals/new${areaQuery && `?${areaQuery}`}`}>
            <Plus size={15} aria-hidden /> Новая цель
          </Link>
        </div>
      </div>

      {(areas.length > 0 || hasGoalsWithoutArea) && (
        <div className="segmented" role="group" aria-label="Фильтр по сферам">
          <button type="button" className="chip" aria-pressed={!areaFilter} onClick={() => selectArea(null)}>
            Все
          </button>
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              className={`chip chip--tone tone-${area.color}`}
              aria-pressed={areaFilter === area.id}
              onClick={() => selectArea(area.id)}
            >
              {area.name}
            </button>
          ))}
          {hasGoalsWithoutArea && (
            <button type="button" className="chip" aria-pressed={areaFilter === NO_AREA} onClick={() => selectArea(NO_AREA)}>
              Без сферы
            </button>
          )}
        </div>
      )}

      {groups.length === 0 && habits.length === 0 ? (
        <div className="card empty" style={{ marginTop: 24 }}>
          <h2>{all.length === 0 ? 'Целей пока нет' : 'В этой сфере целей нет'}</h2>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn--primary" to={`/goals/new${areaQuery && `?${areaQuery}`}`}>
              <Plus size={16} aria-hidden /> Создать цель
            </Link>
            <Link className="btn" to={`/goals/new?kind=habit${areaQuery && `&${areaQuery}`}`}>
              <Repeat size={16} aria-hidden /> Привычка
            </Link>
          </div>
        </div>
      ) : (
        <>
          {activeHabits.length > 0 && (
            <section className="section">
              <h2 className="section__title">
                Привычки <span className="section__count">{activeHabits.length}</span>
              </h2>
              {habitRows(activeHabits)}
            </section>
          )}
          {groups.map((group) => (
            <section className="section" key={group.title}>
              <h2 className="section__title">
                {group.title} <span className="section__count">{group.items.length + (group.title === 'Архив' ? archivedHabits.length : 0)}</span>
              </h2>
              <div className="stack">
                {group.items.map((item) => (
                  <GoalCard
                    key={item.goal.id}
                    item={item}
                    area={item.goal.areaId ? areaMap.get(item.goal.areaId) : undefined}
                    today={today}
                    compact
                  />
                ))}
                {group.title === 'Архив' && archivedHabits.length > 0 && habitRows(archivedHabits)}
              </div>
            </section>
          ))}
          {archivedHabits.length > 0 && !groups.some((g) => g.title === 'Архив') && (
            <section className="section">
              <h2 className="section__title">
                Архив <span className="section__count">{archivedHabits.length}</span>
              </h2>
              {habitRows(archivedHabits)}
            </section>
          )}
        </>
      )}
    </>
  );
}

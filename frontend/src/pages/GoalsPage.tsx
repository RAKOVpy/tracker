import { Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAreas, useAreaMap, useGoalsWithStats } from '../api/hooks';
import { GoalCard } from '../components/GoalCard';
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
  const { data, today, isLoading, error } = useGoalsWithStats();
  const { data: areas = [] } = useAreas();
  const areaMap = useAreaMap();
  const [params, setParams] = useSearchParams();
  const areaFilter = params.get('area');

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const filtered = data.filter((item) => {
    if (!areaFilter) return true;
    if (areaFilter === NO_AREA) return item.goal.areaId === null;
    return item.goal.areaId === areaFilter;
  });
  const groups = groupForList(filtered).filter((g) => g.items.length > 0);
  const hasGoalsWithoutArea = data.some((item) => item.goal.areaId === null);
  const selectedArea = areaFilter ? areaMap.get(areaFilter) : undefined;

  function selectArea(id: string | null) {
    setParams(id ? { area: id } : {}, { replace: true });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">{selectedArea ? 'Сфера' : 'Все цели'}</p>
          <h1>{selectedArea ? selectedArea.name : areaFilter === NO_AREA ? 'Без сферы' : 'Цели'}</h1>
        </div>
        <Link className="btn btn--primary btn--sm" to={selectedArea ? `/goals/new?area=${selectedArea.id}` : '/goals/new'}>
          <Plus size={15} aria-hidden /> Новая цель
        </Link>
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

      {groups.length === 0 ? (
        <div className="card empty" style={{ marginTop: 24 }}>
          <h2>{data.length === 0 ? 'Целей пока нет' : 'В этой сфере целей нет'}</h2>
          <Link className="btn btn--primary" to={selectedArea ? `/goals/new?area=${selectedArea.id}` : '/goals/new'}>
            <Plus size={16} aria-hidden /> Создать цель
          </Link>
        </div>
      ) : (
        groups.map((group) => (
          <section className="section" key={group.title}>
            <h2 className="section__title">
              {group.title} <span className="section__count">{group.items.length}</span>
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
            </div>
          </section>
        ))
      )}
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { seedDemoData } from '../api/demo';
import { useGoalsWithStats } from '../api/hooks';
import { GoalCard } from '../components/GoalCard';
import { compareForToday, type GoalWithStats } from '../domain/progress';
import { formatLong, formatWeekday, type IsoDate } from '../lib/dates';
import { plural } from '../lib/format';

interface Groups {
  todo: GoalWithStats[];
  doneToday: GoalWithStats[];
  overdue: GoalWithStats[];
  upcoming: GoalWithStats[];
  achieved: GoalWithStats[];
  archived: GoalWithStats[];
}

function groupGoals(items: GoalWithStats[]): Groups {
  const groups: Groups = { todo: [], doneToday: [], overdue: [], upcoming: [], achieved: [], archived: [] };
  for (const item of [...items].sort(compareForToday)) {
    const { status, todayLeft } = item.stats;
    if (item.goal.status === 'archived') groups.archived.push(item);
    else if (status === 'achieved') groups.achieved.push(item);
    else if (status === 'upcoming') groups.upcoming.push(item);
    else if (status === 'overdue') groups.overdue.push(item);
    else if (todayLeft > 0) groups.todo.push(item);
    else groups.doneToday.push(item);
  }
  return groups;
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? done / total : 0;
  return (
    <svg className="summary__ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={part >= 1 ? 'var(--good)' : 'var(--accent)'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${c * part} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">
        {done}/{total}
      </text>
    </svg>
  );
}

function Section({ title, items, today, compact }: { title: string; items: GoalWithStats[]; today: IsoDate; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section__title">
        {title} <span className="section__count">{items.length}</span>
      </h2>
      <div className="stack">
        {items.map((item) => (
          <GoalCard key={item.goal.id} item={item} today={today} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  const client = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    await seedDemoData();
    await client.invalidateQueries();
    setSeeding(false);
  }

  return (
    <div className="card empty">
      <div className="empty__icon">🎯</div>
      <h2>Пока нет ни одной цели</h2>
      <p className="muted">
        Добавьте цель с конкретным числом и сроком, например «прочитать 320 страниц к 31 октября», и отмечайте прогресс
        каждый день.
      </p>
      <div className="row">
        <Link className="btn btn--primary" to="/goals/new">
          Создать цель
        </Link>
        <button className="btn" type="button" onClick={seed} disabled={seeding}>
          Показать пример
        </button>
      </div>
    </div>
  );
}

export function TodayPage() {
  const { data, today, isLoading, error } = useGoalsWithStats();

  if (isLoading) return <p className="muted">Загрузка…</p>;
  if (error || !data) return <p className="field__error">Не удалось загрузить цели: {String(error)}</p>;

  const groups = groupGoals(data);
  const activeToday = groups.todo.length + groups.doneToday.length;
  const weekday = formatWeekday(today);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Сегодня</h1>
          <p className="muted">
            {weekday.charAt(0).toUpperCase() + weekday.slice(1)}, {formatLong(today)}
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {activeToday > 0 && (
            <div className="card summary">
              <Ring done={groups.doneToday.length} total={activeToday} />
              <div>
                <div className="summary__title">
                  {groups.todo.length === 0
                    ? 'Всё на сегодня сделано 🎉'
                    : `Осталось ${groups.todo.length} ${plural(groups.todo.length, ['цель', 'цели', 'целей'])} на сегодня`}
                </div>
                <div className="muted small">Выполните дневную норму, чтобы успеть к дедлайну.</div>
              </div>
            </div>
          )}

          <Section title="Нужно сделать сегодня" items={groups.todo} today={today} />
          <Section title="Дедлайн прошёл" items={groups.overdue} today={today} />
          <Section title="Сегодня уже сделано" items={groups.doneToday} today={today} />
          <Section title="Запланированы" items={groups.upcoming} today={today} compact />
          <Section title="Достигнуты" items={groups.achieved} today={today} compact />

          {groups.archived.length > 0 && (
            <details className="section details">
              <summary>
                Архив <span className="section__count">{groups.archived.length}</span>
              </summary>
              <div className="stack" style={{ marginTop: 12 }}>
                {groups.archived.map((item) => (
                  <GoalCard key={item.goal.id} item={item} today={today} compact />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

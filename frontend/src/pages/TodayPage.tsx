import { useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Target } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { seedAllDemo } from '../api/demo';
import { useAreaMap, useGoalsWithStats, useKnowledge, useNow, useTasks } from '../api/hooks';
import { GoalCard } from '../components/GoalCard';
import { DueReviewsCard } from '../components/knowledge/DueReviewsCard';
import { TodayTasks } from '../components/tasks/TodayTasks';
import { VacationBanner } from '../components/VacationBanner';
import { compareForToday, type GoalWithStats } from '../domain/progress';
import { summarizeDay } from '../domain/day';
import { completedOn, isForToday } from '../domain/tasks';
import type { Area } from '../domain/types';
import { formatLong, formatWeekday, type IsoDate } from '../lib/dates';
import { ErrorState, LoadingState } from './states';

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

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? done / total : 0;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden style={{ flex: 'none' }}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--sheet-2)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={part >= 1 ? 'var(--good)' : 'var(--accent)'}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * part} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-ui)">
        {done}/{total}
      </text>
    </svg>
  );
}

interface SectionProps {
  title: string;
  items: GoalWithStats[];
  areas: Map<string, Area>;
  today: IsoDate;
  compact?: boolean;
}

function Section({ title, items, areas, today, compact }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section__title">
        {title} <span className="section__count">{items.length}</span>
      </h2>
      <div className="stack">
        {items.map((item) => (
          <GoalCard
            key={item.goal.id}
            item={item}
            area={item.goal.areaId ? areas.get(item.goal.areaId) : undefined}
            today={today}
            compact={compact}
          />
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
    try {
      await seedAllDemo();
      await client.invalidateQueries();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="card empty">
      <span className="empty__icon">
        <Target size={26} strokeWidth={1.8} aria-hidden />
      </span>
      <h2>Пока нет ни одной цели</h2>
      <p className="muted">
        Поставьте цель с числом и сроком, например «прочитать 320 страниц к 31 октября». Приложение посчитает, сколько
        делать каждый день, и напомнит, если начнёте отставать.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn--primary" to="/goals/new">
          <Plus size={16} aria-hidden /> Создать цель
        </Link>
        <button className="btn" type="button" onClick={seed} disabled={seeding}>
          <Sparkles size={16} aria-hidden /> Показать пример
        </button>
      </div>
    </div>
  );
}

export function TodayPage() {
  const { data, today, isLoading, error } = useGoalsWithStats();
  const areas = useAreaMap();
  const now = useNow();
  const knowledge = useKnowledge();
  const tasks = useTasks();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const groups = groupGoals(data);
  const weekday = formatWeekday(today);
  const sectionProps = { areas, today };
  const day = summarizeDay({
    tasksLeft: tasks.data?.filter((t) => isForToday(t, today)).length ?? 0,
    tasksDone: tasks.data?.filter((t) => t.status === 'done' && completedOn(t) === today).length ?? 0,
    goalsLeft: groups.todo.length,
    goalsDone: groups.doneToday.length,
    reviewsLeft: knowledge.data?.load.queue.length ?? 0,
    reviewedToday: knowledge.data?.load.reviewedToday ?? 0,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">
            {weekday.charAt(0).toUpperCase() + weekday.slice(1)}, {formatLong(today)}
          </p>
          <h1>{greeting(now)}</h1>
        </div>
      </div>

      {day.total > 0 && (
        <div className="card summary slot">
          <Ring done={day.done} total={day.total} />
          <div>
            <div className="summary__title">{day.title}</div>
            <div className="muted small">{day.hint}</div>
          </div>
        </div>
      )}

      {knowledge.data?.load.vacation && (
        <div className="slot">
          <VacationBanner vacation={knowledge.data.load.vacation} />
        </div>
      )}

      {knowledge.data && (
        <div className="slot">
          <DueReviewsCard
            load={knowledge.data.load}
            notes={knowledge.data.notes}
            forecast={knowledge.data.forecast}
            today={today}
            showDone={knowledge.data.notes.some((n) => n.state.lastReviewed === today)}
          />
        </div>
      )}

      {tasks.data && <TodayTasks tasks={tasks.data} today={today} />}

      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="Цели: норма на сегодня" items={groups.todo} {...sectionProps} />
          <Section title="Цели: срок прошёл" items={groups.overdue} {...sectionProps} />
          <Section title="Цели: норма выполнена" items={groups.doneToday} {...sectionProps} />
          <Section title="Цели запланированы" items={groups.upcoming} {...sectionProps} compact />
          <Section title="Цели достигнуты" items={groups.achieved} {...sectionProps} compact />
        </>
      )}
    </>
  );
}

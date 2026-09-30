import { Archive, ArchiveRestore, CalendarClock, CircleCheck, Flag, Pencil, Trash2, TrendingUp, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAreaMap, useDeleteGoal, useGoalWithStats, useUpdateGoal } from '../api/hooks';
import { AreaMark } from '../components/AreaIcon';
import { BackButton } from '../components/BackButton';
import { EntryForm } from '../components/EntryForm';
import { EntryHistory } from '../components/EntryHistory';
import { describePace, formatAmount, type Tone } from '../components/pace';
import { ProgressBar } from '../components/ProgressBar';
import { ProgressChart } from '../components/ProgressChart';
import type { GoalStats } from '../domain/progress';
import type { Goal } from '../domain/types';
import { formatLong, formatShort } from '../lib/dates';
import { formatDays, formatNumber, plural } from '../lib/format';
import { ErrorState, LoadingState } from './states';

const TONE_ICONS: Record<Tone, typeof CircleCheck> = {
  good: CircleCheck,
  warn: TrendingUp,
  bad: TriangleAlert,
  muted: CalendarClock,
};

/** Второе предложение баннера: что делать дальше. */
function paceAdvice(goal: Goal, stats: GoalStats): string {
  switch (stats.status) {
    case 'achieved':
      return `Сделано ${formatAmount(stats.current, goal.unit)} из ${formatNumber(goal.targetValue)}. Можно ставить следующую цель.`;
    case 'upcoming':
      return `План — ${formatAmount(stats.dailyNorm, goal.unit)} в день.`;
    case 'overdue':
      return 'Продлите срок, если цель ещё актуальна, или отправьте её в архив.';
    case 'ahead':
      return 'Можно держать темп или немного сбавить.';
    case 'on_track':
      return stats.todayLeft > 0
        ? `Сегодня нужно ещё ${formatAmount(stats.todayLeft, goal.unit)}, чтобы не отстать.`
        : 'Норма на сегодня выполнена.';
    case 'behind':
      return `Если делать по ${formatAmount(stats.todayTarget, goal.unit)} в день, успеете к ${formatShort(goal.deadline)}.`;
  }
}

export function GoalPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, today, isLoading, error } = useGoalWithStats(id);
  const areas = useAreaMap();
  const updateGoal = useUpdateGoal(id);
  const deleteGoal = useDeleteGoal();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingState />;
  if (!data) {
    if (error && error.name !== 'NotFoundError') return <ErrorState error={error} />;
    return (
      <div className="card empty">
        <h2>Цель не найдена</h2>
        <p className="muted">Возможно, её удалили.</p>
        <Link className="btn" to="/goals">
          Ко всем целям
        </Link>
      </div>
    );
  }

  const { goal, entries, stats } = data;
  const area = goal.areaId ? areas.get(goal.areaId) : undefined;
  const pace = describePace(goal, stats);
  const PaceIcon = TONE_ICONS[pace.tone];
  const isArchived = goal.status === 'archived';

  return (
    <>
      <BackButton fallback="/goals" />

      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div className="goal-card__head">
          <AreaMark area={area} />
          <div>
            <h1>{goal.title}</h1>
            <div className="row" style={{ marginTop: 10 }}>
              {area && <span className={`badge badge--tone tone-${area.color}`}>{area.name}</span>}
              {goal.priority === 'high' && (
                <span className="badge badge--accent">
                  <Flag size={12} strokeWidth={2.2} aria-hidden /> Важно
                </span>
              )}
              <span className="badge">{stats.isLongTerm ? 'Долгосрочная' : 'Краткосрочная'}</span>
              {isArchived && <span className="badge">В архиве</span>}
            </div>
          </div>
        </div>
        <Link className="btn btn--sm" to={`/goals/${goal.id}/edit`}>
          <Pencil size={14} aria-hidden /> Изменить
        </Link>
      </div>

      {goal.description && (
        <p className="muted" style={{ marginBottom: 20, whiteSpace: 'pre-line', maxWidth: '65ch' }}>
          {goal.description}
        </p>
      )}

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack" style={{ gap: 16 }}>
          <div className="stats">
            <div>
              <div className="stat__label">Сделано</div>
              <div className="stat__value">{Math.floor(stats.percent)}%</div>
              <div className="stat__sub num">
                {formatNumber(stats.current)} из {formatAmount(goal.targetValue, goal.unit)}
              </div>
            </div>
            <div>
              <div className="stat__label">Осталось</div>
              <div className="stat__value">{formatAmount(stats.remaining, goal.unit)}</div>
              <div className="stat__sub">
                {stats.daysLeft > 0 ? `за ${formatDays(stats.daysLeft)}` : `срок был ${formatShort(goal.deadline)}`}
              </div>
            </div>
            <div>
              <div className="stat__label">Нужно в день</div>
              <div className="stat__value">
                {stats.status === 'achieved' || stats.daysLeft === 0
                  ? '—'
                  : formatAmount(stats.status === 'upcoming' ? stats.dailyNorm : stats.todayTarget, goal.unit)}
              </div>
              <div className="stat__sub">по плану {formatAmount(stats.dailyNorm, goal.unit)}</div>
            </div>
            <div>
              <div className="stat__label">Серия</div>
              <div className="stat__value">{stats.streak}</div>
              <div className="stat__sub">{plural(stats.streak, ['день', 'дня', 'дней'])} подряд</div>
            </div>
          </div>

          <ProgressBar
            percent={stats.percent}
            planPercent={(stats.expectedByToday / goal.targetValue) * 100}
            tone={stats.status === 'achieved' ? 'good' : stats.status === 'overdue' ? 'bad' : 'accent'}
          />

          <div className={`banner banner--${pace.tone}`}>
            <PaceIcon size={18} strokeWidth={2} aria-hidden />
            <div className="banner__text">
              <strong>{pace.text}</strong>
              <span>{paceAdvice(goal, stats)}</span>
            </div>
          </div>

          <div className="muted small">
            {formatLong(goal.startDate)} → {formatLong(goal.deadline)}
          </div>
        </div>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Отметить прогресс
          </h2>
          <EntryForm goal={goal} today={today} />
        </section>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Динамика
          </h2>
          <ProgressChart goal={goal} stats={stats} today={today} />
        </section>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            История
          </h2>
          <EntryHistory goal={goal} entries={entries} today={today} />
        </section>

        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Удалить цель «{goal.title}» вместе со всей историей ({entries.length}{' '}
              {plural(entries.length, ['запись', 'записи', 'записей'])})? Отменить это нельзя.
            </p>
            <div className="row">
              <button
                className="btn btn--sm btn--danger-solid"
                type="button"
                disabled={deleteGoal.isPending}
                onClick={() => deleteGoal.mutate(goal.id, { onSuccess: () => navigate('/goals') })}
              >
                <Trash2 size={14} aria-hidden /> Удалить навсегда
              </button>
              <button className="btn btn--sm" type="button" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button
              className="btn btn--sm"
              type="button"
              disabled={updateGoal.isPending}
              onClick={() => updateGoal.mutate({ status: isArchived ? 'active' : 'archived' })}
            >
              {isArchived ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
              {isArchived ? 'Вернуть из архива' : 'В архив'}
            </button>
            <button className="btn btn--sm btn--ghost btn--danger" type="button" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} aria-hidden /> Удалить
            </button>
          </div>
        )}
      </div>
    </>
  );
}

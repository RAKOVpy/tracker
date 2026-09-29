import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteGoal, useGoalWithStats, useUpdateGoal } from '../api/hooks';
import { EntryForm } from '../components/EntryForm';
import { EntryHistory } from '../components/EntryHistory';
import { describePace, formatAmount } from '../components/pace';
import { ProgressBar } from '../components/ProgressBar';
import { ProgressChart } from '../components/ProgressChart';
import { CATEGORIES, PRIORITIES } from '../domain/meta';
import { formatLong, formatShort } from '../lib/dates';
import { formatDays, formatNumber, plural } from '../lib/format';

export function GoalPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, today, isLoading } = useGoalWithStats(id);
  const updateGoal = useUpdateGoal(id);
  const deleteGoal = useDeleteGoal();

  if (isLoading) return <p className="muted">Загрузка…</p>;
  if (!data) {
    return (
      <div className="card empty">
        <h2>Цель не найдена</h2>
        <Link className="btn" to="/">
          На главную
        </Link>
      </div>
    );
  }

  const { goal, entries, stats } = data;
  const category = CATEGORIES[goal.category];
  const pace = describePace(goal, stats);
  const isArchived = goal.status === 'archived';

  function remove() {
    if (!confirm(`Удалить цель «${goal.title}» вместе со всей историей?`)) return;
    deleteGoal.mutate(goal.id, { onSuccess: () => navigate('/') });
  }

  return (
    <>
      <Link to="/" className="back-link">
        ← Сегодня
      </Link>

      <div className="page-head">
        <div className="goal-card__head">
          <div className="goal-card__icon" aria-hidden>
            {category.icon}
          </div>
          <div>
            <h1>{goal.title}</h1>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="badge">{category.label}</span>
              <span className={goal.priority === 'high' ? 'badge badge--high' : 'badge'}>
                Приоритет: {PRIORITIES[goal.priority].label.toLowerCase()}
              </span>
              <span className="badge badge--accent">{stats.isLongTerm ? 'Долгосрочная' : 'Краткосрочная'}</span>
              {isArchived && <span className="badge">В архиве</span>}
            </div>
          </div>
        </div>
        <Link className="btn btn--sm" to={`/goals/${goal.id}/edit`}>
          Изменить
        </Link>
      </div>

      {goal.description && <p className="muted" style={{ marginBottom: 16, whiteSpace: 'pre-line' }}>{goal.description}</p>}

      <div className="stack">
        <div className="card stack">
          <div className="stats">
            <div>
              <div className="stat__label">Сделано</div>
              <div className="stat__value">{Math.floor(stats.percent)}%</div>
              <div className="stat__sub">
                {formatNumber(stats.current)} из {formatAmount(goal.targetValue, goal.unit)}
              </div>
            </div>
            <div>
              <div className="stat__label">Осталось</div>
              <div className="stat__value">{formatAmount(stats.remaining, goal.unit)}</div>
              <div className="stat__sub">
                {stats.daysLeft > 0 ? `за ${formatDays(stats.daysLeft)}` : `дедлайн ${formatShort(goal.deadline)}`}
              </div>
            </div>
            <div>
              <div className="stat__label">Нужно в день</div>
              <div className="stat__value">
                {stats.status === 'achieved' || stats.daysLeft === 0
                  ? '—'
                  : formatAmount(stats.status === 'upcoming' ? stats.dailyPlan : stats.todayTarget, goal.unit)}
              </div>
              <div className="stat__sub">план: {formatAmount(stats.dailyPlan, goal.unit)}</div>
            </div>
            <div>
              <div className="stat__label">Серия</div>
              <div className="stat__value">
                {stats.streak > 0 ? '🔥 ' : ''}
                {stats.streak}
              </div>
              <div className="stat__sub">{plural(stats.streak, ['день', 'дня', 'дней'])} подряд</div>
            </div>
          </div>

          <ProgressBar
            percent={stats.percent}
            planPercent={(stats.expectedByToday / goal.targetValue) * 100}
            tone={stats.status === 'achieved' ? 'good' : stats.status === 'overdue' ? 'bad' : 'accent'}
          />
          <div className={`banner banner--${pace.tone}`}>
            {pace.text}
            {stats.status === 'behind' && stats.daysLeft > 0 && (
              <> — чтобы успеть, делайте по {formatAmount(stats.todayTarget, goal.unit)} в день</>
            )}
          </div>
          <div className="muted small">
            {formatLong(goal.startDate)} → {formatLong(goal.deadline)}
          </div>
        </div>

        <section className="card stack">
          <h2>Отметить прогресс</h2>
          <EntryForm goal={goal} today={today} />
        </section>

        <section className="card stack">
          <h2>Динамика</h2>
          <ProgressChart goal={goal} stats={stats} today={today} />
        </section>

        <section className="card stack">
          <h2>История</h2>
          <EntryHistory goal={goal} entries={entries} today={today} />
        </section>

        <div className="row">
          <button
            className="btn btn--sm"
            type="button"
            disabled={updateGoal.isPending}
            onClick={() => updateGoal.mutate({ status: isArchived ? 'active' : 'archived' })}
          >
            {isArchived ? 'Вернуть из архива' : 'В архив'}
          </button>
          <button className="btn btn--sm btn--danger" type="button" onClick={remove} disabled={deleteGoal.isPending}>
            Удалить цель
          </button>
        </div>
      </div>
    </>
  );
}

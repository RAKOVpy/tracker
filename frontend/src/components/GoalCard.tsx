import { Link } from 'react-router-dom';
import { CATEGORIES } from '../domain/meta';
import type { GoalWithStats } from '../domain/progress';
import { formatShort, type IsoDate } from '../lib/dates';
import { formatDays, formatNumber, plural } from '../lib/format';
import { describePace, formatAmount } from './pace';
import { ProgressBar } from './ProgressBar';
import { QuickLog } from './QuickLog';
import { WeekDots } from './WeekDots';

interface Props {
  item: GoalWithStats;
  today: IsoDate;
  /** compact — без блока «сегодня» (для запланированных и завершённых целей). */
  compact?: boolean;
}

export function GoalCard({ item, today, compact = false }: Props) {
  const { goal, stats } = item;
  const category = CATEGORIES[goal.category];
  const pace = describePace(goal, stats);
  const planPercent = goal.targetValue > 0 ? (stats.expectedByToday / goal.targetValue) * 100 : 0;
  const barTone = stats.status === 'achieved' ? 'good' : stats.status === 'overdue' ? 'bad' : 'accent';

  const meta = [
    stats.isLongTerm ? 'Долгосрочная' : 'Краткосрочная',
    `до ${formatShort(goal.deadline)}`,
    stats.status !== 'achieved' && stats.daysLeft > 0 ? `осталось ${formatDays(stats.daysLeft)}` : null,
  ].filter(Boolean);

  return (
    <article className={compact ? 'card goal-card goal-card--compact' : 'card goal-card'}>
      <div className="goal-card__head">
        <div className="goal-card__icon" aria-hidden>
          {category.icon}
        </div>
        <div className="spacer">
          <Link to={`/goals/${goal.id}`} className="goal-card__title">
            {goal.title}
          </Link>
          <div className="goal-card__meta">{meta.join(' · ')}</div>
        </div>
        {goal.priority === 'high' && <span className="badge badge--high">Важно</span>}
      </div>

      <div>
        <ProgressBar percent={stats.percent} planPercent={compact ? undefined : planPercent} tone={barTone} />
        <div className="goal-card__numbers">
          <span>
            <strong>{formatNumber(stats.current)}</strong> / {formatAmount(goal.targetValue, goal.unit)}
          </span>
          <span className="muted">{Math.floor(stats.percent)}%</span>
        </div>
      </div>

      {!compact && stats.todayTarget > 0 && (
        <div className={stats.todayLeft > 0 ? 'today-box' : 'today-box today-box--done'}>
          <div className="today-box__label">
            {stats.todayLeft > 0 ? (
              <>
                Сегодня: <strong>{formatNumber(stats.todayValue)}</strong> из {formatAmount(stats.todayTarget, goal.unit)}
              </>
            ) : (
              <>
                ✅ Сегодня: <strong>{formatAmount(stats.todayValue, goal.unit)}</strong> — норма выполнена
              </>
            )}
          </div>
          <QuickLog goal={goal} today={today} suggested={stats.todayLeft} />
        </div>
      )}

      <div className="goal-card__footer">
        <span className={`pace pace--${pace.tone}`}>{pace.text}</span>
        {!compact && (
          <div className="row">
            {stats.streak > 1 && (
              <span className="badge badge--warn" title="Дней подряд с прогрессом">
                🔥 {stats.streak} {plural(stats.streak, ['день', 'дня', 'дней'])}
              </span>
            )}
            <WeekDots dailyTotals={stats.dailyTotals} today={today} />
          </div>
        )}
      </div>
    </article>
  );
}

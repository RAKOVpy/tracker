import { Check, Flag, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GoalWithStats } from '../domain/progress';
import type { Area } from '../domain/types';
import { formatShort, type IsoDate } from '../lib/dates';
import { formatDays, formatNumber, plural } from '../lib/format';
import { AreaMark } from './AreaIcon';
import { describePace, formatAmount } from './pace';
import { ProgressBar } from './ProgressBar';
import { QuickLog } from './QuickLog';
import { WeekDots } from './WeekDots';

interface Props {
  item: GoalWithStats;
  area: Area | undefined;
  today: IsoDate;
  /** compact — без блока «сегодня» (для запланированных, достигнутых и архивных целей). */
  compact?: boolean;
}

export function GoalCard({ item, area, today, compact = false }: Props) {
  const { goal, stats } = item;
  const pace = describePace(goal, stats);
  const planPercent = (stats.expectedByToday / goal.targetValue) * 100;
  const barTone = stats.status === 'achieved' ? 'good' : stats.status === 'overdue' ? 'bad' : 'accent';

  const meta = [
    area?.name,
    stats.isLongTerm ? 'долгосрочная' : 'краткосрочная',
    `до ${formatShort(goal.deadline)}`,
    stats.status !== 'achieved' && stats.status !== 'upcoming' && stats.daysLeft > 0
      ? `осталось ${formatDays(stats.daysLeft)}`
      : null,
  ].filter(Boolean);

  return (
    <article className={compact ? 'card goal-card goal-card--compact' : 'card goal-card'}>
      <div className="goal-card__head">
        <AreaMark area={area} size={compact ? 'sm' : 'md'} />
        <div className="spacer">
          <Link to={`/goals/${goal.id}`} className="goal-card__title">
            {goal.title}
          </Link>
          <div className="goal-card__meta">{meta.join(' · ')}</div>
        </div>
        {goal.priority === 'high' && (
          <span className="goal-card__important">
            <Flag size={14} strokeWidth={2} aria-hidden /> Важно
          </span>
        )}
      </div>

      <div>
        <ProgressBar percent={stats.percent} planPercent={compact ? undefined : planPercent} tone={barTone} />
        <div className="goal-card__numbers">
          <span>
            <strong>{formatNumber(stats.current)}</strong> <span className="muted">из {formatAmount(goal.targetValue, goal.unit)}</span>
          </span>
          <span className="muted">{Math.floor(stats.percent)}%</span>
        </div>
      </div>

      {!compact && stats.todayTarget > 0 && (
        <div className={stats.todayLeft > 0 ? 'today-box' : 'today-box today-box--done'}>
          <span className="today-box__label">
            {stats.todayLeft > 0 ? (
              <span>
                Сегодня <strong className="num">{formatNumber(stats.todayValue)}</strong> из{' '}
                {formatAmount(stats.todayTarget, goal.unit)}
              </span>
            ) : (
              <>
                <Check size={16} strokeWidth={2.5} aria-hidden />
                <span>
                  Сегодня <strong className="num">{formatAmount(stats.todayValue, goal.unit)}</strong>, норма выполнена
                </span>
              </>
            )}
          </span>
          <QuickLog goal={goal} today={today} suggested={stats.todayLeft} />
        </div>
      )}

      <div className="goal-card__footer">
        <span className={`pace pace--${pace.tone}`}>{pace.text}</span>
        {!compact && (
          <div className="row">
            {stats.streak > 1 && (
              <span className="streak" title="Дней подряд с прогрессом">
                <Flame size={14} strokeWidth={2} aria-hidden /> {stats.streak}{' '}
                {plural(stats.streak, ['день', 'дня', 'дней'])}
              </span>
            )}
            <WeekDots dailyTotals={stats.dailyTotals} today={today} />
          </div>
        )}
      </div>
    </article>
  );
}

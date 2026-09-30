import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  CircleCheck,
  Flag,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAreaMap, useDeleteGoal, useGoal, useToggleHabit, useUpdateGoal, useVacations, useWork, type GoalView } from '../api/hooks';
import { AreaMark } from '../components/AreaIcon';
import { BackButton } from '../components/BackButton';
import { EntryForm } from '../components/EntryForm';
import { EntryHistory } from '../components/EntryHistory';
import { HabitCalendar } from '../components/habits/HabitCalendar';
import { amountText, frequencyText, scheduleText, streakText } from '../components/habits/habitText';
import { describePace, formatAmount, type Tone } from '../components/pace';
import { ProgressBar } from '../components/ProgressBar';
import { ProgressChart } from '../components/ProgressChart';
import { DAILY_FREEZE_DAYS, habitCalendar, isDaily, type HabitWithStats } from '../domain/habits';
import type { GoalStats } from '../domain/progress';
import { nextStep, PROJECT_STATUSES, projectProgress } from '../domain/projects';
import type { Area, Goal, TargetGoal } from '../domain/types';
import { addDays, formatLong, formatShort, type IsoDate } from '../lib/dates';
import { formatDays, formatNumber, plural } from '../lib/format';
import { ErrorState, LoadingState } from './states';

const TONE_ICONS: Record<Tone, LucideIcon> = {
  good: CircleCheck,
  warn: TrendingUp,
  bad: TriangleAlert,
  muted: CalendarClock,
};

/** Второе предложение баннера: что делать дальше. */
function paceAdvice(goal: TargetGoal, stats: GoalStats): string {
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
  const { data, today, isLoading, error } = useGoal(id);
  const areas = useAreaMap();

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

  const area = data.goal.areaId ? areas.get(data.goal.areaId) : undefined;
  return data.kind === 'habit' ? <HabitView item={data} area={area} today={today} /> : <TargetView item={data} area={area} today={today} />;
}

/** Шапка страницы цели или привычки: сфера, название, отметки, «Изменить» и заметки. */
function GoalHead({ goal, area, badges }: { goal: Goal; area: Area | undefined; badges: ReactNode }) {
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
              {badges}
              {goal.status === 'archived' && <span className="badge">В архиве</span>}
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
    </>
  );
}

/** Проекты, которые ведут к цели или привычке. */
function GoalProjects({ goal, today }: { goal: Goal; today: IsoDate }) {
  const work = useWork();
  const projects = work.data?.projects.filter((p) => p.goalId === goal.id) ?? [];
  return (
    <section className="card stack">
      <div className="panel-head">
        <h2 className="section__title" style={{ margin: 0 }}>
          Проекты {projects.length > 0 && <span className="section__count">{projects.length}</span>}
        </h2>
        <Link className="btn btn--sm btn--ghost" to={`/projects/new?goal=${goal.id}`}>
          <Plus size={15} aria-hidden /> Проект
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {goal.kind === 'habit'
            ? 'Привычка может поддерживать проект: «английский каждый день» — для «подготовиться к IELTS».'
            : 'Проект — путь к цели по шагам: для «набрать 7.0 на IELTS» это «подготовиться к IELTS» с вехами и задачами.'}
        </p>
      ) : (
        <ul className="goal-projects">
          {projects.map((project) => {
            const tasks = work.data?.tasks.filter((t) => t.projectId === project.id) ?? [];
            const progress = projectProgress(tasks);
            const next = project.status === 'active' ? nextStep(project, tasks, today) : null;
            return (
              <li key={project.id} className="goal-projects__row">
                <FolderKanban size={16} aria-hidden />
                <span className="spacer">
                  <Link to={`/projects/${project.id}`} className="task-row__title">
                    {project.title}
                  </Link>
                  <span className="task-row__meta">
                    <span className="num">
                      {progress.done} из {progress.total}
                    </span>
                    {project.status !== 'active' && <span>{PROJECT_STATUSES[project.status].toLowerCase()}</span>}
                    {next && <span>дальше: {next.title}</span>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Архив и удаление с подтверждением. */
function GoalActions({ goal, entries }: { goal: Goal; entries: number }) {
  const navigate = useNavigate();
  const updateGoal = useUpdateGoal(goal.id);
  const deleteGoal = useDeleteGoal();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = goal.status === 'archived';
  const what = goal.kind === 'habit' ? 'привычку' : 'цель';

  if (confirmingDelete) {
    return (
      <div className="confirm">
        <p>
          Удалить {what} «{goal.title}» вместе со всей историей ({entries} {plural(entries, ['запись', 'записи', 'записей'])})? Отменить это
          нельзя.
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
    );
  }
  return (
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
  );
}

function TargetView({ item, area, today }: { item: Extract<GoalView, { kind: 'target' }>; area: Area | undefined; today: IsoDate }) {
  const { goal, entries, stats } = item;
  const pace = describePace(goal, stats);
  const PaceIcon = TONE_ICONS[pace.tone];

  return (
    <>
      <GoalHead goal={goal} area={area} badges={<span className="badge">{stats.isLongTerm ? 'Долгосрочная' : 'Краткосрочная'}</span>} />

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

        <GoalProjects goal={goal} today={today} />

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

        <GoalActions goal={goal} entries={entries.length} />
      </div>
    </>
  );
}

/** Что с привычкой сегодня и что делать дальше — одним баннером. */
function habitAdvice({ goal, stats }: HabitWithStats, today: IsoDate): { tone: Tone; title: string; text: string } {
  const { week } = stats;
  const weekText = `На неделе ${week.done} из ${week.quota}`;
  // Прощённый недавно пропуск: следующий в эти дни прервёт серию.
  const lastForgiven = isDaily(goal) ? stats.forgiven[0] : undefined;
  const freezeUntil = lastForgiven ? addDays(lastForgiven, DAILY_FREEZE_DAYS - 1) : null;
  const freezeText =
    freezeUntil && freezeUntil >= today && stats.streak > 0
      ? ` Пропуск ${formatShort(lastForgiven!)} серия простила — до ${formatShort(freezeUntil)} лучше не пропускать.`
      : '';

  switch (stats.state) {
    case 'upcoming':
      return { tone: 'muted', title: `Начнётся ${formatShort(goal.startDate)}`, text: 'До старта отмечать не нужно.' };
    case 'paused':
      return { tone: 'muted', title: 'Отпуск: привычка на паузе', text: 'Серия не сгорит. Отметить день всё равно можно — он засчитается.' };
    case 'done':
      return {
        tone: 'good',
        title: 'Сегодня отмечено',
        text: isDaily(goal) ? `Так держать.${freezeText}` : `${weekText}.${week.done >= week.quota ? ' Норма недели выполнена.' : ''}`,
      };
    case 'due':
      return isDaily(goal)
        ? { tone: freezeText ? 'warn' : 'muted', title: 'Сегодня ещё не отмечено', text: freezeText.trim() || 'Одна отметка — и день засчитан.' }
        : { tone: 'warn', title: 'Сегодня нужно', text: `${weekText}: иначе до воскресенья не успеть.` };
    case 'open':
      return { tone: 'muted', title: weekText, text: `Осталось ${week.quota - week.done} — можно сегодня или в другой день.` };
    case 'rest':
      return week.quota === 0
        ? { tone: 'muted', title: 'На этой неделе можно не делать', text: 'Неделя почти вся в отпуске или до старта привычки.' }
        : { tone: 'good', title: 'Норма недели выполнена', text: `${weekText}. Можно отдохнуть или сделать ещё.` };
  }
}

function HabitView({ item, area, today }: { item: Extract<GoalView, { kind: 'habit' }>; area: Area | undefined; today: IsoDate }) {
  const { goal, entries, stats } = item;
  const { data: vacations = [] } = useVacations();
  const toggle = useToggleHabit();
  const daily = isDaily(goal);
  const advice = habitAdvice(item, today);
  const AdviceIcon = TONE_ICONS[advice.tone];
  const rate = stats.rate;
  const canCheck = goal.status === 'active' && stats.state !== 'upcoming';
  const yesterday = addDays(today, -1);

  return (
    <>
      <GoalHead goal={goal} area={area} badges={<span className="badge">Привычка: {scheduleText(goal)}</span>} />

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack" style={{ gap: 16 }}>
          <div className="stats">
            <div>
              <div className="stat__label">Серия</div>
              <div className="stat__value">{stats.streak}</div>
              <div className="stat__sub">{streakText(goal, stats.streak).replace(/^\d+ /, '')}</div>
            </div>
            <div>
              <div className="stat__label">Эта неделя</div>
              <div className="stat__value num">
                {stats.week.done} из {stats.week.quota}
              </div>
              <div className="stat__sub">{daily ? 'дней' : 'раз'} засчитано</div>
            </div>
            <div>
              <div className="stat__label">За 4 недели</div>
              <div className="stat__value">{rate ? `${Math.round((rate.done / rate.total) * 100)}%` : '—'}</div>
              <div className="stat__sub num">{rate ? `${rate.done} из ${rate.total}` : 'пока мало истории'}</div>
            </div>
            <div>
              <div className="stat__label">Сегодня</div>
              <div className="stat__value">
                {stats.todayDone ? 'Сделано' : stats.todayValue > 0 ? formatAmount(stats.todayValue, goal.unit) : 'Нет'}
              </div>
              <div className="stat__sub">{amountText(goal) ? `норма ${amountText(goal)}` : 'одна отметка'}</div>
            </div>
          </div>

          <div className={`banner banner--${advice.tone} banner--action`}>
            <AdviceIcon size={18} strokeWidth={2} aria-hidden />
            <div className="banner__text spacer">
              <strong>{advice.title}</strong>
              <span>{advice.text}</span>
            </div>
            {canCheck && (
              <button
                className={stats.todayDone ? 'btn btn--sm' : 'btn btn--sm btn--primary'}
                type="button"
                onClick={() => toggle.mutate({ goal, date: today, value: stats.todayDone ? null : stats.todayLeft })}
              >
                {stats.todayDone ? (
                  'Снять отметку'
                ) : (
                  <>
                    <Check size={15} strokeWidth={2.5} aria-hidden /> Отметить сегодня
                  </>
                )}
              </button>
            )}
          </div>

          <p className="muted small" style={{ margin: 0 }}>
            {daily
              ? 'Серия — дни подряд. Один пропуск в неделю её не прерывает, но и не продлевает; отпуск тоже.'
              : `Серия — недели подряд с выполненной нормой (${frequencyText(goal)}). Неделя без одного раза не чаще раза в четыре недели серию не прерывает; отпуск уменьшает норму недели.`}
          </p>
        </div>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Последние недели
          </h2>
          <HabitCalendar weeks={habitCalendar(item, today, vacations)} unit={goal.unit} daily={daily} />
        </section>

        <GoalProjects goal={goal} today={today} />

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Отметить за другой день
          </h2>
          <EntryForm goal={goal} today={today} defaultDate={yesterday >= goal.startDate ? yesterday : today} suggested={goal.targetValue} />
        </section>

        {entries.length > 0 && (
          <details className="card details">
            <summary className="small">Все записи: {entries.length}</summary>
            <div style={{ marginTop: 12 }}>
              <EntryHistory goal={goal} entries={entries} today={today} />
            </div>
          </details>
        )}

        <GoalActions goal={goal} entries={entries.length} />
      </div>
    </>
  );
}

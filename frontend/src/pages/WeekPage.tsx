import { ArrowLeft, ArrowRight, Check, CircleCheck, FolderKanban, Pencil, Repeat, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGoals, useKnowledge, useSaveWeeklyReview, useToday, useVacations, useWeeklyReviews, useWork } from '../api/hooks';
import { streakText } from '../components/habits/habitText';
import { DueReviewsCard } from '../components/knowledge/DueReviewsCard';
import { describePace } from '../components/pace';
import { habitWeek } from '../domain/habits';
import { isReadyToFinish, isStalled } from '../domain/projects';
import type { ChecklistItem, WeeklyReview } from '../domain/types';
import { FOCUS_LIMIT, focusSuggestions, focusWeekOf, reviewWeekFor, weekResults, type WeekResults } from '../domain/week';
import { addDays, formatShort, type IsoDate } from '../lib/dates';
import { plural } from '../lib/format';
import { FocusList } from '../components/week/FocusList';
import { weekRange } from '../components/week/weekText';
import { InboxPage } from './tasks/InboxPage';
import { ErrorState, LoadingState } from './states';

const STEPS = ['Входящие', 'Цели и привычки', 'Повторения', 'Фокус', 'Итоги'] as const;

// ---------- черновик: переживает уход на другую страницу (например, в повторение) ----------

interface Draft {
  step: number;
  focus: ChecklistItem[];
  reflection: string;
}

const draftKey = (weekStart: IsoDate) => `tracker:week-draft:${weekStart}`;

function loadDraft(weekStart: IsoDate): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(weekStart));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(weekStart: IsoDate, draft: Draft | null): void {
  try {
    if (draft) sessionStorage.setItem(draftKey(weekStart), JSON.stringify(draft));
    else sessionStorage.removeItem(draftKey(weekStart));
  } catch {
    // Без sessionStorage черновик просто не переживёт перезагрузку.
  }
}

const emptyItem = (): ChecklistItem => ({ id: crypto.randomUUID(), text: '', done: false });

/** Поля фокуса: всегда FOCUS_LIMIT строк, пустые при сохранении отбрасываются. */
function focusSlots(focus: ChecklistItem[]): ChecklistItem[] {
  return [...focus, ...Array.from({ length: Math.max(0, FOCUS_LIMIT - focus.length) }, emptyItem)].slice(0, FOCUS_LIMIT);
}

// ---------- страница ----------

export function WeekPage() {
  const today = useToday();
  const reviews = useWeeklyReviews();
  const weekStart = reviewWeekFor(today);
  const existing = reviews.data?.find((r) => r.weekStart === weekStart) ?? null;
  const [editing, setEditing] = useState(false);

  if (reviews.isLoading) return <LoadingState />;
  if (reviews.error || !reviews.data) return <ErrorState error={reviews.error} />;

  const past = reviews.data.filter((r) => r.weekStart < weekStart).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Обзор недели</p>
          <h1>{weekRange(weekStart)}</h1>
        </div>
      </div>

      {existing && !editing ? (
        <ReviewDone review={existing} today={today} onEdit={() => setEditing(true)} />
      ) : (
        <ReviewSteps key={weekStart} weekStart={weekStart} existing={existing} today={today} onSaved={() => setEditing(false)} />
      )}

      {past.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Прошлые недели <span className="section__count">{past.length}</span>
          </h2>
          <div className="stack">
            {past.map((review) => (
              <PastReview key={review.id} review={review} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Итоги недели одной строкой цифр: задачи, повторения, привычки, прошлый фокус. */
function ResultsLine({ results }: { results: WeekResults }) {
  const focusDone = results.focus?.filter((f) => f.done).length ?? 0;
  const items = [
    `${results.tasksDone} ${plural(results.tasksDone, ['задача сделана', 'задачи сделано', 'задач сделано'])}`,
    `${results.reviews} ${plural(results.reviews, ['повторение', 'повторения', 'повторений'])}`,
    results.habits && `привычки: ${results.habits.done} из ${results.habits.total} (${Math.round((results.habits.done / results.habits.total) * 100)}%)`,
    results.focus && results.focus.length > 0 && `фокус: ${focusDone} из ${results.focus.length}`,
  ].filter((item): item is string => Boolean(item));
  return <p className="week-results">{items.join(' · ')}</p>;
}

function useResults(weekStart: IsoDate, today: IsoDate): WeekResults | null {
  const work = useWork();
  const goals = useGoals();
  const knowledge = useKnowledge();
  const vacations = useVacations();
  const reviews = useWeeklyReviews();
  if (!work.data || !goals.data || !knowledge.data || !vacations.data || !reviews.data) return null;
  return weekResults({
    weekStart,
    today,
    tasks: work.data.tasks,
    reviews: knowledge.data.notes.flatMap((n) => n.reviews),
    habits: goals.data.habits,
    weeklyReviews: reviews.data,
    vacations: vacations.data,
  });
}

function ReviewDone({ review, today, onEdit }: { review: WeeklyReview; today: IsoDate; onEdit: () => void }) {
  const results = useResults(review.weekStart, today);
  const focusWeek = focusWeekOf(review.weekStart);
  const nextReview = addDays(focusWeek, 4);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="banner banner--good">
        <CircleCheck size={18} strokeWidth={2} aria-hidden />
        <div className="banner__text">
          <strong>Неделя подведена</strong>
          <span>
            {today < focusWeek
              ? `Фокус — на следующую неделю, ${weekRange(focusWeek)}.`
              : `Следующий обзор — с пятницы, ${formatShort(nextReview)}.`}
          </span>
        </div>
      </div>

      {results && <ResultsLine results={results} />}

      <section className="card stack">
        <div className="panel-head">
          <h2 className="section__title" style={{ margin: 0 }}>
            Фокус на {weekRange(focusWeek)}
          </h2>
          <button className="btn btn--sm btn--ghost" type="button" onClick={onEdit}>
            <Pencil size={14} aria-hidden /> Изменить обзор
          </button>
        </div>
        {review.focus.length > 0 ? <FocusList review={review} /> : <p className="muted small">Фокус не выбран.</p>}
        {review.reflection && (
          <div>
            <div className="field__label">Что получилось, что мешало</div>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{review.reflection}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PastReview({ review }: { review: WeeklyReview }) {
  const done = review.focus.filter((f) => f.done).length;
  return (
    <article className="card stack past-review">
      <div className="panel-head">
        <b>{weekRange(review.weekStart)}</b>
        {review.focus.length > 0 && (
          <span className="muted small num">
            фокус на {weekRange(focusWeekOf(review.weekStart))}: {done} из {review.focus.length}
          </span>
        )}
      </div>
      {review.focus.length > 0 && <FocusList review={review} readOnly />}
      {review.reflection && <p className="muted small" style={{ margin: 0, whiteSpace: 'pre-line' }}>{review.reflection}</p>}
    </article>
  );
}

// ---------- шаги обзора ----------

interface StepsProps {
  weekStart: IsoDate;
  existing: WeeklyReview | null;
  today: IsoDate;
  onSaved: () => void;
}

function ReviewSteps({ weekStart, existing, today, onSaved }: StepsProps) {
  const [draft, setDraft] = useState<Draft>(
    () =>
      loadDraft(weekStart) ?? {
        step: 0,
        focus: focusSlots(existing?.focus ?? []),
        reflection: existing?.reflection ?? '',
      },
  );
  const save = useSaveWeeklyReview();

  useEffect(() => saveDraft(weekStart, draft), [weekStart, draft]);

  const setStep = (step: number) => {
    setDraft((d) => ({ ...d, step }));
    window.scrollTo({ top: 0 });
  };

  function submit() {
    const focus = draft.focus.map((f) => ({ ...f, text: f.text.trim() })).filter((f) => f.text);
    save.mutate(
      { existing, input: { weekStart, focus, reflection: draft.reflection.trim() } },
      {
        onSuccess: () => {
          saveDraft(weekStart, null);
          onSaved();
        },
      },
    );
  }

  const last = draft.step === STEPS.length - 1;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted" style={{ margin: 0, maxWidth: '65ch' }}>
        Десять минут раз в неделю: разобрать входящие, посмотреть, где отстают цели и привычки, проверить повторения, выбрать
        главное на следующую неделю и записать, что получилось.
      </p>

      <ol className="week-steps" aria-label="Шаги обзора">
        {STEPS.map((title, index) => (
          <li key={title}>
            <button
              type="button"
              className="week-step"
              aria-current={index === draft.step ? 'step' : undefined}
              data-done={index < draft.step || undefined}
              onClick={() => setStep(index)}
            >
              <span className="week-step__n">{index < draft.step ? <Check size={12} strokeWidth={3} aria-hidden /> : index + 1}</span>
              {title}
            </button>
          </li>
        ))}
      </ol>

      <section className="stack" aria-label={STEPS[draft.step]}>
        {draft.step === 0 && <InboxStep />}
        {draft.step === 1 && <GoalsStep weekStart={weekStart} today={today} />}
        {draft.step === 2 && <ReviewsStep today={today} />}
        {draft.step === 3 && (
          <FocusStep weekStart={weekStart} today={today} focus={draft.focus} onChange={(focus) => setDraft((d) => ({ ...d, focus }))} />
        )}
        {draft.step === 4 && (
          <ReflectionStep weekStart={weekStart} today={today} value={draft.reflection} onChange={(reflection) => setDraft((d) => ({ ...d, reflection }))} />
        )}
      </section>

      <div className="row week-nav">
        {draft.step > 0 && (
          <button className="btn" type="button" onClick={() => setStep(draft.step - 1)}>
            <ArrowLeft size={15} aria-hidden /> Назад
          </button>
        )}
        {last ? (
          <button className="btn btn--primary" type="button" disabled={save.isPending} onClick={submit}>
            <Check size={15} aria-hidden /> {existing ? 'Сохранить обзор' : 'Завершить обзор'}
          </button>
        ) : (
          <button className="btn btn--primary" type="button" onClick={() => setStep(draft.step + 1)}>
            Дальше <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function StepIntro({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="section__title" style={{ marginBottom: 4 }}>
        {title}
      </h2>
      <p className="muted small" style={{ margin: 0, maxWidth: '65ch' }}>
        {text}
      </p>
    </div>
  );
}

function InboxStep() {
  return (
    <>
      <StepIntro
        title="1. Разобрать входящие"
        text="Каждую запись — в задачи, в «Хочу изучить», в проект, отметить сделанной или удалить. Пустые «Входящие» — спокойная голова."
      />
      <InboxPage embedded />
    </>
  );
}

function GoalsStep({ weekStart, today }: { weekStart: IsoDate; today: IsoDate }) {
  const goals = useGoals();
  const work = useWork();
  const { data: vacations = [] } = useVacations();
  if (!goals.data || !work.data) return <LoadingState />;

  const end = addDays(weekStart, 6);
  const behind = goals.data.targets.filter((g) => g.goal.status === 'active' && (g.stats.status === 'behind' || g.stats.status === 'overdue'));
  const habits = goals.data.habits.filter((h) => {
    if (h.goal.status !== 'active') return false;
    const week = habitWeek(h, weekStart, today, vacations, end < today ? end : today);
    return week.quota > 0 && week.done < week.quota;
  });
  const stalled = work.data.projects.filter((p) => {
    const tasks = work.data!.tasks.filter((t) => t.projectId === p.id);
    return isStalled(p, tasks) && !isReadyToFinish(p, tasks);
  });
  const nothing = behind.length + habits.length + stalled.length === 0;

  return (
    <>
      <StepIntro
        title="2. Где отстаю"
        text="Цели, которые отстают от плана, привычки, которые на этой неделе не выполнены, и проекты без следующего шага. Решите для каждого: наверстать, сдвинуть срок или отпустить."
      />
      {nothing ? (
        <p className="notice notice--good">Всё идёт по плану: отстающих целей и привычек нет, у проектов есть следующий шаг.</p>
      ) : (
        <ul className="card task-list">
          {behind.map(({ goal, stats }) => (
            <li key={goal.id} className="task-row">
              <Target size={16} aria-hidden className="week-item__icon" />
              <div className="task-row__main">
                <Link to={`/goals/${goal.id}`} className="task-row__title">
                  {goal.title}
                </Link>
                <div className="task-row__meta">
                  <span className={`pace pace--${describePace(goal, stats).tone}`}>{describePace(goal, stats).text}</span>
                </div>
              </div>
            </li>
          ))}
          {habits.map((habit) => {
            const week = habitWeek(habit, weekStart, today, vacations, end < today ? end : today);
            return (
              <li key={habit.goal.id} className="task-row">
                <Repeat size={16} aria-hidden className="week-item__icon" />
                <div className="task-row__main">
                  <Link to={`/goals/${habit.goal.id}`} className="task-row__title">
                    {habit.goal.title}
                  </Link>
                  <div className="task-row__meta">
                    <span className="tag tag--warn">
                      за неделю {week.done} из {week.quota}
                    </span>
                    {habit.stats.streak > 1 && <span>серия {streakText(habit.goal, habit.stats.streak)}</span>}
                  </div>
                </div>
              </li>
            );
          })}
          {stalled.map((project) => (
            <li key={project.id} className="task-row">
              <FolderKanban size={16} aria-hidden className="week-item__icon" />
              <div className="task-row__main">
                <Link to={`/projects/${project.id}`} className="task-row__title">
                  {project.title}
                </Link>
                <div className="task-row__meta">
                  <span className="tag tag--warn">нет следующего шага</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReviewsStep({ today }: { today: IsoDate }) {
  const knowledge = useKnowledge();
  if (!knowledge.data) return <LoadingState />;
  const { load, notes, forecast, materials, settings } = knowledge.data;
  const active = materials.filter((m) => m.status === 'active').length;
  const queued = materials.filter((m) => m.status === 'queued').length;

  return (
    <>
      <StepIntro
        title="3. Повторения и долг"
        text="Сколько заметок ждёт, есть ли долг и не пора ли начать новый материал из очереди «Хочу изучить»."
      />
      {notes.length === 0 ? (
        <p className="muted">Заметок для повторения пока нет.</p>
      ) : (
        <DueReviewsCard load={load} notes={notes} forecast={forecast} today={today} showDone />
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Изучаю {active} из {settings.activeMaterialsLimit}
        {queued > 0 && `, в очереди ${queued}`}. <Link to="/knowledge">Открыть «Знания»</Link>
      </p>
    </>
  );
}

interface FocusStepProps {
  weekStart: IsoDate;
  today: IsoDate;
  focus: ChecklistItem[];
  onChange: (focus: ChecklistItem[]) => void;
}

function FocusStep({ weekStart, today, focus, onChange }: FocusStepProps) {
  const goals = useGoals();
  const work = useWork();
  const reviews = useWeeklyReviews();
  const { data: vacations = [] } = useVacations();
  const previous = reviews.data?.find((r) => focusWeekOf(r.weekStart) === weekStart) ?? null;
  const suggestions =
    goals.data && work.data
      ? focusSuggestions({
          weekStart,
          today,
          focus: previous?.focus ?? null,
          tasks: work.data.inWork,
          projects: work.data.projects,
          goals: goals.data.targets,
          habits: goals.data.habits,
          vacations,
        })
      : [];
  const chosen = new Set(focus.map((f) => f.text.trim().toLowerCase()).filter(Boolean));
  const free = focus.findIndex((f) => !f.text.trim());

  const setText = (id: string, text: string) => onChange(focus.map((f) => (f.id === id ? { ...f, text } : f)));

  return (
    <>
      <StepIntro
        title={`4. Фокус на ${weekRange(focusWeekOf(weekStart))}`}
        text={`До ${FOCUS_LIMIT} главных дел на следующую неделю — то, что сдвинет цели. Фокус будет на «Сегодня» всю неделю, пункты можно отмечать.`}
      />
      <div className="card stack">
        {focus.map((item, index) => (
          <label key={item.id} className="focus-input">
            <span className="focus-input__n" aria-hidden>
              {index + 1}
            </span>
            <input
              className="input"
              value={item.text}
              placeholder={index === 0 ? 'Самое главное на неделю' : 'Ещё одно важное дело'}
              aria-label={`Фокус, пункт ${index + 1}`}
              onChange={(e) => setText(item.id, e.target.value)}
            />
          </label>
        ))}
        {suggestions.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="field__label">Подсказки</span>
            <div className="focus-suggestions">
              {suggestions.slice(0, 8).map((s) => (
                <button
                  key={s.text}
                  type="button"
                  className="chip focus-suggestion"
                  disabled={free === -1 || chosen.has(s.text.toLowerCase())}
                  onClick={() => setText(focus[free].id, s.text)}
                  title={s.why}
                >
                  {s.text}
                  <span className="focus-suggestion__why">{s.why}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface ReflectionStepProps {
  weekStart: IsoDate;
  today: IsoDate;
  value: string;
  onChange: (value: string) => void;
}

function ReflectionStep({ weekStart, today, value, onChange }: ReflectionStepProps) {
  const results = useResults(weekStart, today);
  const reviews = useWeeklyReviews();
  // Фокус подводимой недели выбран в прошлом обзоре; его пункты можно отметить прямо здесь.
  const previous = reviews.data?.find((r) => focusWeekOf(r.weekStart) === weekStart);
  return (
    <>
      <StepIntro title="5. Что получилось, что мешало" text="Пара строк для себя: через месяц по ним видно, что работает, а что нет." />
      {results && <ResultsLine results={results} />}
      {previous && previous.focus.length > 0 && (
        <div className="card stack">
          <span className="field__label">Фокус этой недели — что сделано?</span>
          <FocusList review={previous} />
        </div>
      )}
      <textarea
        className="textarea"
        rows={5}
        value={value}
        placeholder={'Получилось: …\nМешало: …'}
        aria-label="Что получилось, что мешало"
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

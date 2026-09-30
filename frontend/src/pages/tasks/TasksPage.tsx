import { FolderKanban, Inbox, Plus, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { seedTasksDemo } from '../../api/demo';
import { useAreaMap, useMaterialMap, useProjectMap, useToday, useWork } from '../../api/hooks';
import { useQuickCapture } from '../../components/quickCapture';
import { TaskRow } from '../../components/tasks/TaskRow';
import {
  BUCKET_ORDER,
  BUCKET_TITLES,
  compareTasks,
  QUADRANT_ORDER,
  QUADRANTS,
  quadrant,
  taskBucket,
  type TaskBucket,
} from '../../domain/tasks';
import type { Task } from '../../domain/types';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState } from '../states';
import { useSeedDemo } from '../../components/useSeedDemo';

/** Сколько закрытых задач показывать в «Сделано»: старые не нужны каждый день. */
const CLOSED_LIMIT = 50;

function EmptyTasks() {
  const openCapture = useQuickCapture();
  const { seeding, seed } = useSeedDemo(seedTasksDemo);

  return (
    <div className="card empty">
      <h2>Задач пока нет</h2>
      <p className="muted">
        Запишите дело за пару секунд — кнопкой «Записать» или клавишей N. Без даты оно попадёт во «Входящие», а разобрать
        можно потом: когда делать, к какому сроку и насколько это важно.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn--primary" type="button" onClick={openCapture}>
          <Plus size={16} aria-hidden /> Записать
        </button>
        <Link className="btn" to="/tasks/new">
          Новая задача подробно
        </Link>
        <button className="btn btn--ghost" type="button" onClick={seed} disabled={seeding}>
          <Sparkles size={16} aria-hidden /> Показать пример
        </button>
      </div>
    </div>
  );
}

export function TasksPage() {
  const today = useToday();
  const { data: work, isLoading, error } = useWork();
  const areas = useAreaMap();
  const projects = useProjectMap();
  const materials = useMaterialMap();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'matrix' ? 'matrix' : 'dates';

  if (isLoading) return <LoadingState />;
  if (error || !work) return <ErrorState error={error} />;

  const { tasks, inWork } = work;
  const open = inWork.filter((t) => t.status === 'todo').sort((a, b) => compareTasks(a, b, today));
  // Задачи проектов на паузе и завершённых ждут в своих проектах.
  const hidden = tasks.filter((t) => t.status === 'todo').length - open.length;
  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  const closed = tasks
    .filter((t) => t.status === 'done' || t.status === 'cancelled')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const row = (task: Task, showPlan: boolean) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      area={task.areaId ? areas.get(task.areaId) : undefined}
      project={task.projectId ? projects.get(task.projectId) : undefined}
      material={task.materialId ? materials.get(task.materialId) : undefined}
      showPlan={showPlan}
    />
  );

  const byBucket = new Map<TaskBucket, Task[]>();
  for (const task of open) {
    const bucket = taskBucket(task, today);
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), task]);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Когда делать и что важно</p>
          <h1>Задачи</h1>
        </div>
        <div className="row">
          <Link className="btn btn--sm" to="/projects">
            <FolderKanban size={15} aria-hidden /> Проекты
          </Link>
          {inboxCount > 0 && (
            <Link className="btn btn--sm" to="/inbox">
              <Inbox size={15} aria-hidden /> Входящие · {inboxCount}
            </Link>
          )}
          <Link className="btn btn--primary btn--sm" to="/tasks/new">
            <Plus size={15} aria-hidden /> Задача
          </Link>
        </div>
      </div>

      {open.length === 0 && closed.length === 0 && hidden === 0 ? (
        inboxCount > 0 ? (
          <p className="muted">
            Открытых задач нет. Во «Входящих» ждут разбора {inboxCount} {plural(inboxCount, ['запись', 'записи', 'записей'])}:{' '}
            <Link to="/inbox">разобрать</Link>.
          </p>
        ) : (
          <EmptyTasks />
        )
      ) : (
        <>
          <div className="segmented" role="group" aria-label="Вид списка">
            <button type="button" className="chip" aria-pressed={view === 'dates'} onClick={() => setParams({}, { replace: true })}>
              По срокам
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={view === 'matrix'}
              onClick={() => setParams({ view: 'matrix' }, { replace: true })}
            >
              Важно / срочно
            </button>
          </div>

          {open.length === 0 && <p className="muted section">Открытых задач нет — всё сделано.</p>}

          {view === 'dates' ? (
            BUCKET_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => (
              <section className="section" key={bucket}>
                <h2 className="section__title">
                  {BUCKET_TITLES[bucket]} <span className="section__count">{byBucket.get(bucket)?.length}</span>
                </h2>
                <ul className="card task-list">{byBucket.get(bucket)?.map((task) => row(task, bucket !== 'today' && bucket !== 'overdue'))}</ul>
              </section>
            ))
          ) : (
            <div className="matrix section">
              {QUADRANT_ORDER.map((q) => {
                const list = open.filter((task) => quadrant(task, today) === q);
                return (
                  <section key={q} className={`card matrix__cell matrix__cell--${q}`} aria-labelledby={`quadrant-${q}`}>
                    <h2 className="matrix__title" id={`quadrant-${q}`}>
                      {QUADRANTS[q].title} <span className="section__count">{list.length}</span>
                    </h2>
                    <p className="muted small">{QUADRANTS[q].hint}</p>
                    {list.length > 0 ? <ul className="task-list">{list.map((task) => row(task, true))}</ul> : <p className="muted small">Пусто.</p>}
                  </section>
                );
              })}
              <p className="muted small matrix__note">
                Важность задаётся вручную, срочность — по дедлайну: срочно, если до него 2 дня или меньше.
              </p>
            </div>
          )}

          {hidden > 0 && (
            <p className="muted small section">
              Ещё {hidden} {plural(hidden, ['задача', 'задачи', 'задач'])} в проектах на паузе и завершённых —{' '}
              <Link to="/projects">в проектах</Link>.
            </p>
          )}

          {closed.length > 0 && (
            <details className="details section">
              <summary className="small">Сделано и отменено: {closed.length}</summary>
              <ul className="card task-list">{closed.slice(0, CLOSED_LIMIT).map((task) => row(task, false))}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

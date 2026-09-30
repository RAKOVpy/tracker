import {
  Ban,
  BookOpen,
  Check,
  CalendarArrowUp,
  Flag,
  FolderKanban,
  ListTodo,
  Pencil,
  Repeat,
  RotateCcw,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useAreaMap,
  useAreas,
  useCreateTask,
  useDeleteTask,
  useEditChecklist,
  useMaterialMap,
  useProjectMap,
  useProjects,
  useTasks,
  useToday,
  useUpdateTask,
} from '../../api/hooks';
import { BackButton } from '../../components/BackButton';
import { TaskForm, type TaskFields } from '../../components/tasks/TaskForm';
import { deadlineTag, planTag } from '../../components/tasks/taskText';
import { useGoBack } from '../../components/useGoBack';
import { describeRecurrence, previousRepeats } from '../../domain/recurrence';
import { checklistProgress, completedOn } from '../../domain/tasks';
import type { ChecklistItem, Project, Task } from '../../domain/types';
import { addDays, formatDateTime, formatLong, type IsoDate } from '../../lib/dates';
import { ErrorState, LoadingState, NotFoundState } from '../states';

const STATUS_BADGES: Partial<Record<Task['status'], string>> = {
  inbox: 'Во «Входящих»',
  done: 'Сделано',
  cancelled: 'Отменена',
};

function Checklist({ task }: { task: Task }) {
  const { edit } = useEditChecklist();
  const [text, setText] = useState('');
  const { done, total } = checklistProgress(task);
  const save = (change: (checklist: ChecklistItem[]) => ChecklistItem[]) => edit(task, change);

  function add(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    save((list) => [...list, { id: crypto.randomUUID(), text: value, done: false }]);
    setText('');
  }

  return (
    <section className="card stack">
      <h2 className="section__title" style={{ margin: 0 }}>
        Подзадачи {total > 0 && <span className="section__count">{`${done} из ${total}`}</span>}
      </h2>
      {total > 0 && (
        <ul className="checklist">
          {task.checklist.map((item) => (
            <li key={item.id} className={item.done ? 'checklist__item checklist__item--done' : 'checklist__item'}>
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.text}
                className="task-check task-check--sm"
                onClick={() => save((list) => list.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
              >
                <Check size={12} strokeWidth={3} aria-hidden />
              </button>
              <span className="spacer">{item.text}</span>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Удалить подзадачу «${item.text}»`}
                onClick={() => save((list) => list.filter((x) => x.id !== item.id))}
              >
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="checklist__add" onSubmit={add}>
        <input
          className="input"
          placeholder={total > 0 ? 'Ещё подзадача' : 'Разбить на шаги: первый шаг…'}
          aria-label="Новая подзадача"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn--sm" type="submit" disabled={!text.trim()}>
          Добавить
        </button>
      </form>
    </section>
  );
}

/** Проекты для выбора в форме: не завершённые и не отменённые, плюс текущий проект задачи. */
function projectOptions(projects: Project[], currentId: string | null): Project[] {
  return projects.filter((p) => p.status === 'active' || p.status === 'paused' || p.id === currentId);
}

/** Прошлые повторы: когда сделан или пропущен. */
function RepeatHistory({ task, tasks }: { task: Task; tasks: Task[] }) {
  const previous = previousRepeats(task, tasks, 6);
  if (previous.length === 0) return null;
  return (
    <section className="card stack">
      <h2 className="section__title" style={{ margin: 0 }}>
        Прошлые разы
      </h2>
      <ul className="repeat-history">
        {previous.map((t) => {
          const day = completedOn(t) ?? t.plannedDate ?? t.deadline;
          const label = t.status === 'done' ? 'сделано' : t.status === 'cancelled' ? 'пропущено' : 'не закрыто';
          return (
            <li key={t.id}>
              <Link to={`/tasks/${t.id}`}>{day ? formatLong(day) : 'без даты'}</Link>
              <span className={t.status === 'done' ? 'tag--good' : 'muted'}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function describePlan(plannedDate: IsoDate | null, today: IsoDate): string {
  if (!plannedDate) return 'не запланировано';
  return planTag(plannedDate, today) ?? 'сегодня';
}

export function TaskPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { data: tasks, isLoading, error } = useTasks();
  const areas = useAreaMap();
  const projects = useProjectMap();
  const materials = useMaterialMap();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !tasks) return <ErrorState error={error} />;
  const task = tasks.find((t) => t.id === id);
  if (!task) return <NotFoundState title="Задача не найдена" back="/tasks" />;

  const area = task.areaId ? areas.get(task.areaId) : undefined;
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  const milestone = project?.milestones.find((m) => m.id === task.milestoneId);
  const material = task.materialId ? materials.get(task.materialId) : undefined;
  const part = material?.parts.find((p) => p.id === task.partId);
  const closed = task.status === 'done' || task.status === 'cancelled';
  const repeating = task.recurrence !== null && !closed;
  // Закрыли повторяющуюся задачу — появился следующий повтор.
  const next = closed ? tasks.find((t) => t.repeatOf === task.id) : undefined;
  const tomorrow = addDays(today, 1);
  const deadline = task.deadline ? deadlineTag(task.deadline, today) : null;
  const setStatus = (status: Task['status']) => update.mutate({ id: task.id, patch: { status } });

  return (
    <>
      <BackButton fallback="/tasks" />
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className={closed ? 'task-title--closed' : undefined}>{task.title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            {STATUS_BADGES[task.status] && <span className="badge">{STATUS_BADGES[task.status]}</span>}
            {task.important && (
              <span className="badge badge--accent">
                <Flag size={12} strokeWidth={2.2} aria-hidden /> Важно
              </span>
            )}
            {area && <span className={`badge badge--tone tone-${area.color}`}>{area.name}</span>}
            {project && (
              <Link className="badge badge--link" to={`/projects/${project.id}`}>
                <FolderKanban size={12} aria-hidden /> {project.title}
                {milestone && ` · ${milestone.title}`}
              </Link>
            )}
            {material && (
              <Link className="badge badge--link" to={`/knowledge/materials/${material.id}`}>
                <BookOpen size={12} aria-hidden /> {material.title}
                {part && ` · ${part.title}`}
              </Link>
            )}
          </div>
        </div>
        <Link className="btn btn--sm" to={`/tasks/${task.id}/edit`}>
          <Pencil size={14} aria-hidden /> Изменить
        </Link>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack">
          <div className="stats stats--2">
            <div>
              <div className="stat__label">Когда делаю</div>
              <div className="stat__value">{closed ? '—' : describePlan(task.plannedDate, today)}</div>
              {task.plannedDate && !closed && <div className="stat__sub">{formatLong(task.plannedDate)}</div>}
            </div>
            <div>
              <div className="stat__label">Дедлайн</div>
              <div className={deadline?.tone && !closed ? `stat__value tag--${deadline.tone}` : 'stat__value'}>
                {deadline ? deadline.text : 'нет'}
              </div>
              {task.deadline && <div className="stat__sub">{formatLong(task.deadline)}</div>}
            </div>
          </div>

          {repeating && (
            <p className="repeat-line">
              <Repeat size={15} aria-hidden /> Повторяется {describeRecurrence(task.recurrence!)}: когда отметите, появится следующий раз.
            </p>
          )}
          {next && (
            <p className="repeat-line">
              <Repeat size={15} aria-hidden /> Следующий раз —{' '}
              <Link to={`/tasks/${next.id}`}>{next.plannedDate || next.deadline ? formatLong((next.plannedDate ?? next.deadline)!) : 'без даты'}</Link>
            </p>
          )}

          {task.status === 'done' && task.completedAt && <p className="muted small">Сделано {formatDateTime(task.completedAt)}.</p>}
          {task.status === 'cancelled' && task.completedAt && (
            <p className="muted small">Отменена {formatDateTime(task.completedAt)}.</p>
          )}

          <div className="row">
            {task.status === 'inbox' && (
              <button className="btn btn--primary btn--sm" type="button" disabled={update.isPending} onClick={() => setStatus('todo')}>
                <ListTodo size={15} aria-hidden /> Сделать задачей
              </button>
            )}
            {(task.status === 'todo' || task.status === 'inbox') && (
              <button
                className={task.status === 'todo' ? 'btn btn--primary btn--sm' : 'btn btn--sm'}
                type="button"
                disabled={update.isPending}
                onClick={() => setStatus('done')}
              >
                <Check size={15} aria-hidden /> Сделано
              </button>
            )}
            {task.status === 'todo' && task.plannedDate !== tomorrow && (
              <button
                className="btn btn--sm"
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: task.id, patch: { plannedDate: tomorrow } })}
              >
                <CalendarArrowUp size={15} aria-hidden /> На завтра
              </button>
            )}
            {closed && (
              <button className="btn btn--sm" type="button" disabled={update.isPending} onClick={() => setStatus('todo')}>
                <RotateCcw size={15} aria-hidden /> Вернуть в работу
              </button>
            )}
          </div>
        </div>

        {task.notes && (
          <section className="card stack">
            <h2 className="section__title" style={{ margin: 0 }}>
              Заметки
            </h2>
            <p className="summary-text">{task.notes}</p>
          </section>
        )}

        <Checklist task={task} />

        <RepeatHistory task={task} tasks={tasks} />

        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Удалить задачу «{task.title}»? Отменить это нельзя.{' '}
              {repeating
                ? 'Повторы прекратятся. Если нужно пропустить только этот раз, нажмите «Пропустить раз».'
                : 'Если задача просто больше не нужна, её можно отменить.'}
            </p>
            <div className="row">
              <button
                className="btn btn--sm btn--danger-solid"
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(task.id, { onSuccess: () => navigate('/tasks', { replace: true }) })}
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
            {repeating && (
              <>
                <button className="btn btn--sm" type="button" disabled={update.isPending} onClick={() => setStatus('cancelled')}>
                  <SkipForward size={14} aria-hidden /> Пропустить раз
                </button>
                <button
                  className="btn btn--sm"
                  type="button"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: task.id, patch: { recurrence: null } })}
                >
                  <Ban size={14} aria-hidden /> Больше не повторять
                </button>
              </>
            )}
            {!closed && !repeating && (
              <button className="btn btn--sm" type="button" disabled={update.isPending} onClick={() => setStatus('cancelled')}>
                <Ban size={14} aria-hidden /> Не буду делать
              </button>
            )}
            <button className="btn btn--sm btn--ghost btn--danger" type="button" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} aria-hidden /> Удалить
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function NewTaskPage() {
  const navigate = useNavigate();
  const today = useToday();
  const areas = useAreas();
  const projects = useProjects();
  const create = useCreateTask();
  const goBack = useGoBack('/tasks');

  if (areas.isLoading || projects.isLoading) return <LoadingState />;
  if (areas.error || projects.error || !areas.data || !projects.data) return <ErrorState error={areas.error ?? projects.error} />;

  return (
    <>
      <div className="page-head">
        <h1>Новая задача</h1>
      </div>
      <TaskForm
        areas={areas.data}
        projects={projectOptions(projects.data, null)}
        today={today}
        submitLabel="Добавить задачу"
        isSubmitting={create.isPending}
        onSubmit={(fields: TaskFields) =>
          create.mutate({ ...fields, status: 'todo' }, { onSuccess: (task) => navigate(`/tasks/${task.id}`, { replace: true }) })
        }
        onCancel={goBack}
      />
    </>
  );
}

export function EditTaskPage() {
  const { id = '' } = useParams();
  const today = useToday();
  const tasks = useTasks();
  const areas = useAreas();
  const projects = useProjects();
  const update = useUpdateTask();
  const goBack = useGoBack(`/tasks/${id}`);

  if (tasks.isLoading || areas.isLoading || projects.isLoading) return <LoadingState />;
  if (tasks.error || areas.error || projects.error || !tasks.data || !areas.data || !projects.data) {
    return <ErrorState error={tasks.error ?? areas.error ?? projects.error} />;
  }
  const task = tasks.data.find((t) => t.id === id);
  if (!task) return <NotFoundState title="Задача не найдена" back="/tasks" />;

  const { title, notes, important, deadline, plannedDate, areaId, projectId, milestoneId, materialId, partId, checklist, recurrence } = task;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{task.title}</h1>
        </div>
      </div>
      <TaskForm
        areas={areas.data}
        projects={projectOptions(projects.data, task.projectId)}
        today={today}
        initial={{ title, notes, important, deadline, plannedDate, areaId, projectId, milestoneId, materialId, partId, checklist, recurrence }}
        submitLabel="Сохранить"
        isSubmitting={update.isPending}
        onSubmit={(fields) => update.mutate({ id, patch: fields }, { onSuccess: goBack })}
        onCancel={goBack}
      />
    </>
  );
}

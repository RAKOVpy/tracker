import { BookOpen, Check, Flag, FolderPlus, Inbox, ListTodo, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  useAreas,
  useCreateTask,
  useDeleteTask,
  useInboxToMaterial,
  useInboxToProject,
  useProjects,
  useTasks,
  useToday,
  useUpdateTask,
} from '../../api/hooks';
import { AREA_ICON_COMPONENTS } from '../../components/areaIcons';
import { ProjectPicker } from '../../components/projects/ProjectPicker';
import { useQuickCapture } from '../../components/quickCapture';
import type { Area, Project, Task } from '../../domain/types';
import { addDays, formatRelative, todayIso, type IsoDate } from '../../lib/dates';
import { ErrorState, LoadingState } from '../states';

/** Что сделали с записью — чтобы показать и дать вернуть. */
type Done =
  /** `before` — запись до разбора: «Вернуть» восстанавливает её целиком. */
  | { kind: 'task'; task: Task; before: Task }
  | { kind: 'done'; task: Task }
  | { kind: 'material'; title: string; materialId: string }
  | { kind: 'project'; title: string; projectId: string }
  | { kind: 'deleted'; task: Task };

interface ProcessProps {
  task: Task;
  areas: Area[];
  /** Проекты в работе и на паузе — туда можно положить задачу. */
  projects: Project[];
  today: IsoDate;
  onSaved: (task: Task) => void;
  onCancel: () => void;
}

/** «В задачи»: когда делать, к какому сроку, важно ли, к какой сфере и проекту. */
function ProcessForm({ task, areas, projects, today, onSaved, onCancel }: ProcessProps) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [plannedDate, setPlannedDate] = useState<IsoDate | null>(null);
  const [deadline, setDeadline] = useState<IsoDate | null>(null);
  const [important, setImportant] = useState(false);
  const [areaId, setAreaId] = useState<string | null>(task.areaId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    const patch = { title: text, status: 'todo' as const, plannedDate, deadline, important, areaId, projectId, milestoneId };
    update.mutate({ id: task.id, patch }, { onSuccess: (saved) => onSaved(saved) });
  }

  const day = (label: string, date: IsoDate | null) => (
    <button type="button" className="chip" aria-pressed={plannedDate === date} onClick={() => setPlannedDate(date)}>
      {label}
    </button>
  );

  return (
    <form className="inbox-process" onSubmit={submit}>
      <div className="field">
        <label className="field__label" htmlFor={`process-title-${task.id}`}>
          Задача
        </label>
        <input id={`process-title-${task.id}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor={`process-planned-${task.id}`}>
            Когда делаю
          </label>
          <div className="segmented" role="group" aria-label="Когда делаю">
            {day('Сегодня', today)}
            {day('Завтра', addDays(today, 1))}
            {day('Без даты', null)}
          </div>
          <input
            id={`process-planned-${task.id}`}
            className="input"
            type="date"
            value={plannedDate ?? ''}
            onChange={(e) => setPlannedDate(e.target.value || null)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`process-deadline-${task.id}`}>
            Дедлайн
          </label>
          <input
            id={`process-deadline-${task.id}`}
            className="input"
            type="date"
            value={deadline ?? ''}
            onChange={(e) => setDeadline(e.target.value || null)}
          />
          <div>
            <button type="button" className="chip" aria-pressed={important} onClick={() => setImportant((v) => !v)}>
              <Flag size={14} aria-hidden /> Важно
            </button>
          </div>
        </div>
      </div>
      {projects.length > 0 && (
        <ProjectPicker
          idPrefix={`process-${task.id}`}
          projects={projects}
          projectId={projectId}
          milestoneId={milestoneId}
          onChange={(value) => {
            setProjectId(value.projectId);
            setMilestoneId(value.milestoneId);
            if (value.project?.areaId && areaId === null) setAreaId(value.project.areaId);
          }}
        />
      )}
      <div className="segmented" role="group" aria-label="Сфера">
        {areas.map((area) => {
          const Icon = AREA_ICON_COMPONENTS[area.icon];
          return (
            <button
              key={area.id}
              type="button"
              className={`chip chip--tone tone-${area.color}`}
              aria-pressed={areaId === area.id}
              onClick={() => setAreaId(areaId === area.id ? null : area.id)}
            >
              <Icon size={15} strokeWidth={1.8} aria-hidden /> {area.name}
            </button>
          );
        })}
      </div>
      <div className="row">
        <button className="btn btn--primary btn--sm" type="submit" disabled={!title.trim() || update.isPending}>
          Сохранить задачу
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

/** `embedded` — внутри обзора недели: без шапки страницы, пустые «Входящие» — одной строкой. */
export function InboxPage({ embedded = false }: { embedded?: boolean }) {
  const today = useToday();
  const { data: tasks, isLoading, error } = useTasks();
  const { data: areas = [] } = useAreas();
  const { data: projects = [] } = useProjects();
  const openCapture = useQuickCapture();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const create = useCreateTask();
  const toMaterial = useInboxToMaterial();
  const toProject = useInboxToProject();
  const [processing, setProcessing] = useState<string | null>(null);
  const [last, setLast] = useState<Done | null>(null);

  if (isLoading) return <LoadingState />;
  if (error || !tasks) return <ErrorState error={error} />;

  // Старые записи первыми: разбирать по порядку.
  const inbox = tasks.filter((t) => t.status === 'inbox').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const busy = update.isPending || remove.isPending || toMaterial.isPending || toProject.isPending;
  const openProjects = projects.filter((p) => p.status === 'active' || p.status === 'paused');

  function undo() {
    if (!last) return;
    if (last.kind === 'task') {
      const { title, status, important, deadline, plannedDate, areaId, projectId, milestoneId } = last.before;
      update.mutate({ id: last.task.id, patch: { title, status, important, deadline, plannedDate, areaId, projectId, milestoneId } });
    } else if (last.kind === 'done') {
      update.mutate({ id: last.task.id, patch: { status: 'inbox' } });
    } else if (last.kind === 'deleted') {
      const { id: _id, completedAt: _completedAt, createdAt: _createdAt, ...fields } = last.task;
      create.mutate({ ...fields, status: 'inbox' });
    }
    setLast(null);
  }

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <p className="page-head__eyebrow">Записать сейчас, решить потом</p>
            <h1>Входящие</h1>
          </div>
          <button className="btn btn--primary btn--sm" type="button" onClick={openCapture}>
            <Plus size={15} aria-hidden /> Записать
          </button>
        </div>
      )}

      {last && (
        <p className="notice notice--good inbox-last" role="status">
          <span className="spacer">
            {last.kind === 'task' && <>«{last.task.title}» — теперь задача.</>}
            {last.kind === 'done' && <>«{last.task.title}» — отмечено сделанным.</>}
            {last.kind === 'deleted' && <>«{last.task.title}» — удалено.</>}
            {last.kind === 'material' && (
              <>
                «{last.title}» — в «Хочу изучить». <Link to={`/knowledge/materials/${last.materialId}`}>Открыть материал</Link>
              </>
            )}
            {last.kind === 'project' && (
              <>
                «{last.title}» — теперь проект. <Link to={`/projects/${last.projectId}`}>Разбить на шаги</Link>
              </>
            )}
          </span>
          {last.kind !== 'material' && last.kind !== 'project' && (
            <button className="btn btn--sm btn--ghost" type="button" onClick={undo}>
              Вернуть
            </button>
          )}
        </p>
      )}

      {inbox.length === 0 && embedded ? (
        <p className="notice notice--good">Во «Входящих» пусто — всё разобрано.</p>
      ) : inbox.length === 0 ? (
        <div className="card empty">
          <span className="empty__icon">
            <Inbox size={26} strokeWidth={1.8} aria-hidden />
          </span>
          <h2>Во «Входящих» пусто</h2>
          <p className="muted">
            Сюда попадает всё, что записано без даты: мысль, дело, книга, которую хочется прочитать. Записать можно из любого
            места — кнопкой «Записать» или клавишей N.
          </p>
          <Link className="btn" to="/tasks">
            К задачам
          </Link>
        </div>
      ) : (
        <>
          <p className="muted small section__hint">
            Для каждой записи решите: сделать задачей (можно сразу в проект), отложить в «Хочу изучить», превратить
            в проект, если это много шагов, отметить сделанным, если это заняло минуту, или удалить.
          </p>
          <ul className="card inbox-list">
            {inbox.map((task) => (
              <li key={task.id} className="inbox-item">
                <div className="inbox-item__head">
                  <div className="inbox-item__text">
                    <Link to={`/tasks/${task.id}`} className="task-row__title">
                      {task.title}
                    </Link>
                    <div className="task-row__meta">записано {formatRelative(todayIso(new Date(task.createdAt)), today)}</div>
                  </div>
                  {processing !== task.id && (
                    <div className="inbox-item__actions">
                      <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => setProcessing(task.id)}>
                        <ListTodo size={15} aria-hidden /> В задачи
                      </button>
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          toMaterial.mutate(task, {
                            onSuccess: (material) => setLast({ kind: 'material', title: material.title, materialId: material.id }),
                          })
                        }
                      >
                        <BookOpen size={15} aria-hidden /> Хочу изучить
                      </button>
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={busy}
                        title="Это не одно дело, а несколько шагов"
                        onClick={() =>
                          toProject.mutate(task, {
                            onSuccess: (project) => setLast({ kind: 'project', title: project.title, projectId: project.id }),
                          })
                        }
                      >
                        <FolderPlus size={15} aria-hidden /> Это проект
                      </button>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label={`Уже сделано: ${task.title}`}
                        title="Уже сделано"
                        disabled={busy}
                        onClick={() =>
                          update.mutate({ id: task.id, patch: { status: 'done' } }, { onSuccess: (saved) => setLast({ kind: 'done', task: saved }) })
                        }
                      >
                        <Check size={16} aria-hidden />
                      </button>
                      <button
                        className="icon-btn icon-btn--danger"
                        type="button"
                        aria-label={`Удалить: ${task.title}`}
                        title="Удалить"
                        disabled={busy}
                        onClick={() => remove.mutate(task.id, { onSuccess: () => setLast({ kind: 'deleted', task }) })}
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                {processing === task.id && (
                  <ProcessForm
                    task={task}
                    areas={areas}
                    projects={openProjects}
                    today={today}
                    onSaved={(saved) => {
                      setProcessing(null);
                      setLast({ kind: 'task', task: saved, before: task });
                    }}
                    onCancel={() => setProcessing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

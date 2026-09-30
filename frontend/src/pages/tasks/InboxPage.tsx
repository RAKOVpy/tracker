import { BookOpen, Check, Flag, Inbox, ListTodo, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAreas, useCreateTask, useDeleteTask, useInboxToMaterial, useTasks, useToday, useUpdateTask } from '../../api/hooks';
import { AREA_ICON_COMPONENTS } from '../../components/areaIcons';
import { useQuickCapture } from '../../components/quickCapture';
import type { Area, Task } from '../../domain/types';
import { addDays, formatRelative, todayIso, type IsoDate } from '../../lib/dates';
import { ErrorState, LoadingState } from '../states';

/** Что сделали с записью — чтобы показать и дать вернуть. */
type Done =
  | { kind: 'task'; task: Task }
  | { kind: 'done'; task: Task }
  | { kind: 'material'; title: string; materialId: string }
  | { kind: 'deleted'; task: Task };

interface ProcessProps {
  task: Task;
  areas: Area[];
  today: IsoDate;
  onSaved: (task: Task) => void;
  onCancel: () => void;
}

/** «В задачи»: когда делать, к какому сроку, важно ли и к какой сфере. */
function ProcessForm({ task, areas, today, onSaved, onCancel }: ProcessProps) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [plannedDate, setPlannedDate] = useState<IsoDate | null>(null);
  const [deadline, setDeadline] = useState<IsoDate | null>(null);
  const [important, setImportant] = useState(false);
  const [areaId, setAreaId] = useState<string | null>(task.areaId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    const patch = { title: text, status: 'todo' as const, plannedDate, deadline, important, areaId };
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

export function InboxPage() {
  const today = useToday();
  const { data: tasks, isLoading, error } = useTasks();
  const { data: areas = [] } = useAreas();
  const openCapture = useQuickCapture();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const create = useCreateTask();
  const toMaterial = useInboxToMaterial();
  const [processing, setProcessing] = useState<string | null>(null);
  const [last, setLast] = useState<Done | null>(null);

  if (isLoading) return <LoadingState />;
  if (error || !tasks) return <ErrorState error={error} />;

  // Старые записи первыми: разбирать по порядку.
  const inbox = tasks.filter((t) => t.status === 'inbox').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const busy = update.isPending || remove.isPending || toMaterial.isPending;

  function undo() {
    if (!last) return;
    if (last.kind === 'task' || last.kind === 'done') {
      update.mutate({ id: last.task.id, patch: { status: 'inbox' } });
    } else if (last.kind === 'deleted') {
      const { title, notes, important, deadline, plannedDate, areaId, checklist } = last.task;
      create.mutate({ title, notes, status: 'inbox', important, deadline, plannedDate, areaId, checklist });
    }
    setLast(null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Записать сейчас, решить потом</p>
          <h1>Входящие</h1>
        </div>
        <button className="btn btn--primary btn--sm" type="button" onClick={openCapture}>
          <Plus size={15} aria-hidden /> Записать
        </button>
      </div>

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
          </span>
          {last.kind !== 'material' && (
            <button className="btn btn--sm btn--ghost" type="button" onClick={undo}>
              Вернуть
            </button>
          )}
        </p>
      )}

      {inbox.length === 0 ? (
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
            Для каждой записи решите: сделать задачей, отложить в «Хочу изучить», отметить сделанным, если это заняло
            минуту, или удалить.
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
                    today={today}
                    onSaved={(saved) => {
                      setProcessing(null);
                      setLast({ kind: 'task', task: saved });
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

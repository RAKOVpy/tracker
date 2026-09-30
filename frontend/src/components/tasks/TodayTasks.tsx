import { CalendarArrowUp, Inbox, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAreaMap, useCreateTask, useMaterialMap, usePlanTasks, useProjectMap } from '../../api/hooks';
import { compareTasks, completedOn, isForToday, postponeCandidates, taskBucket, taskInput } from '../../domain/tasks';
import type { Task } from '../../domain/types';
import { addDays, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ParsedChips } from './ParsedChips';
import { TaskRow } from './TaskRow';
import { deadlineTag, planTag } from './taskText';
import { useTaskParser } from './useTaskParser';

interface Props {
  /** Задачи в работе — без задач проектов на паузе и завершённых. */
  tasks: Task[];
  today: IsoDate;
}

const tasksWord = (n: number) => plural(n, ['задачу', 'задачи', 'задач']);

/** Задачи дня на «Сегодня»: с прошедшим сроком и на сегодня, сделанные сегодня — зачёркнутыми в конце. */
export function TodayTasks({ tasks, today }: Props) {
  const areas = useAreaMap();
  const projects = useProjectMap();
  const materials = useMaterialMap();
  const create = useCreateTask();
  const plan = usePlanTasks();
  const [title, setTitle] = useState('');
  const [confirmingPostpone, setConfirmingPostpone] = useState(false);
  // Задача, добавленная отсюда, но не на сегодня: «до пт» или «каждое вс» — покажем, куда она ушла.
  const [elsewhere, setElsewhere] = useState<Task | null>(null);
  const { parsed, dismiss, reset } = useTaskParser(title);

  const open = tasks.filter((t) => isForToday(t, today)).sort((a, b) => compareTasks(a, b, today));
  const doneToday = tasks.filter((t) => t.status === 'done' && completedOn(t) === today);
  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  const postpone = postponeCandidates(tasks, today);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!parsed.title) return;
    const project = parsed.projectId ? projects.get(parsed.projectId) : undefined;
    create.mutate(
      taskInput({
        title: parsed.title,
        // Без даты в тексте — на сегодня. У повтора дата своя: иначе отсчёт пошёл бы от сегодня.
        plannedDate: parsed.recurrence ? parsed.plannedDate : (parsed.plannedDate ?? today),
        deadline: parsed.deadline,
        recurrence: parsed.recurrence,
        important: parsed.important,
        areaId: parsed.areaId ?? project?.areaId ?? null,
        projectId: parsed.projectId,
      }),
      {
        onSuccess: (task) => {
          setTitle('');
          reset();
          setElsewhere(isForToday(task, today) ? null : task);
        },
      },
    );
  }

  /** «завтра», «до пт» — куда ушла задача, добавленная не на сегодня. */
  function whenText(task: Task): string {
    if (task.plannedDate) return planTag(task.plannedDate, today) ?? 'сегодня';
    if (task.deadline) return deadlineTag(task.deadline, today).text;
    return taskBucket(task, today) === 'someday' ? 'без даты' : '';
  }

  function postponeAll() {
    plan.mutate(
      { ids: postpone.map((t) => t.id), plannedDate: addDays(today, 1) },
      { onSuccess: () => setConfirmingPostpone(false) },
    );
  }

  return (
    <section className="section" aria-labelledby="today-tasks">
      <div className="panel-head">
        <h2 className="section__title" id="today-tasks" style={{ margin: 0 }}>
          Задачи {open.length > 0 && <span className="section__count">{open.length}</span>}
        </h2>
        {postpone.length > 0 && !confirmingPostpone && (
          <button className="btn btn--sm btn--ghost" type="button" onClick={() => setConfirmingPostpone(true)}>
            <CalendarArrowUp size={15} aria-hidden /> Перенести на завтра
          </button>
        )}
      </div>

      {confirmingPostpone && (
        <div className="confirm confirm--soft" style={{ marginBottom: 12 }}>
          <p>
            Перенести {postpone.length} {tasksWord(postpone.length)} на завтра? Задачи с дедлайном сегодня останутся: перенос
            не отменит срок.
          </p>
          <div className="row">
            <button className="btn btn--sm btn--primary" type="button" disabled={plan.isPending} onClick={postponeAll}>
              Перенести
            </button>
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setConfirmingPostpone(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {inboxCount > 0 && (
        <p className="inbox-hint">
          <Inbox size={16} aria-hidden />
          <span>
            Во «Входящих» {inboxCount} {plural(inboxCount, ['запись', 'записи', 'записей'])} —{' '}
            <Link to="/inbox">разобрать</Link>
          </span>
        </p>
      )}

      <div className="card today-tasks">
        {open.length + doneToday.length > 0 ? (
          <ul className="task-list" style={{ padding: 0 }}>
            {[...open, ...doneToday].map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                area={task.areaId ? areas.get(task.areaId) : undefined}
                project={task.projectId ? projects.get(task.projectId) : undefined}
                material={task.materialId ? materials.get(task.materialId) : undefined}
              />
            ))}
          </ul>
        ) : (
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            На сегодня задач нет.
          </p>
        )}
        <form className="today-tasks__add" onSubmit={add}>
          <input
            className="input"
            placeholder="Добавить задачу на сегодня"
            aria-label="Новая задача на сегодня"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setElsewhere(null);
            }}
          />
          <button className="btn btn--sm" type="submit" disabled={!parsed.title || create.isPending} aria-label="Добавить">
            <Plus size={15} aria-hidden />
          </button>
        </form>
        <ParsedChips parsed={parsed} today={today} onDismiss={dismiss} />
        {elsewhere && (
          <p className="today-tasks__elsewhere small" role="status">
            «<Link to={`/tasks/${elsewhere.id}`}>{elsewhere.title}</Link>» — в задачах, {whenText(elsewhere)}.
          </p>
        )}
      </div>
    </section>
  );
}

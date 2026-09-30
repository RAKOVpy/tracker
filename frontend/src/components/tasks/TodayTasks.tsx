import { CalendarArrowUp, Inbox, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAreaMap, useCreateTask, usePlanTasks } from '../../api/hooks';
import { compareTasks, completedOn, isForToday, postponeCandidates } from '../../domain/tasks';
import type { Task } from '../../domain/types';
import { addDays, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: Task[];
  today: IsoDate;
}

const tasksWord = (n: number) => plural(n, ['задачу', 'задачи', 'задач']);

/** Задачи дня на «Сегодня»: с прошедшим сроком и на сегодня, сделанные сегодня — зачёркнутыми в конце. */
export function TodayTasks({ tasks, today }: Props) {
  const areas = useAreaMap();
  const create = useCreateTask();
  const plan = usePlanTasks();
  const [title, setTitle] = useState('');
  const [confirmingPostpone, setConfirmingPostpone] = useState(false);

  const open = tasks.filter((t) => isForToday(t, today)).sort((a, b) => compareTasks(a, b, today));
  const doneToday = tasks.filter((t) => t.status === 'done' && completedOn(t) === today);
  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  const postpone = postponeCandidates(tasks, today);

  function add(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    create.mutate(
      { title: text, notes: '', status: 'todo', important: false, deadline: null, plannedDate: today, areaId: null, checklist: [] },
      { onSuccess: () => setTitle('') },
    );
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
              <TaskRow key={task.id} task={task} today={today} area={task.areaId ? areas.get(task.areaId) : undefined} />
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
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn btn--sm" type="submit" disabled={!title.trim() || create.isPending} aria-label="Добавить">
            <Plus size={15} aria-hidden />
          </button>
        </form>
      </div>
    </section>
  );
}

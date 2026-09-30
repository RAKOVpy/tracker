import { Check, Flag, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useUpdateTask } from '../../api/hooks';
import { carriedFrom, checklistProgress } from '../../domain/tasks';
import type { Area, Task } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { deadlineTag, planTag } from './taskText';

interface Props {
  task: Task;
  today: IsoDate;
  area?: Area;
  /** Показывать дату «когда делаю» (в списке задач; на «Сегодня» она и так сегодня). */
  showPlan?: boolean;
  /** Кнопки справа, например «На завтра». */
  actions?: ReactNode;
}

/** Отметка «сделано» одним нажатием. Отменённую задачу можно вернуть в работу с её страницы. */
export function TaskCheck({ task }: { task: Task }) {
  const update = useUpdateTask();
  const done = task.status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Вернуть в работу: ${task.title}` : `Сделано: ${task.title}`}
      className="task-check"
      disabled={task.status === 'cancelled'}
      onClick={() => update.mutate({ id: task.id, patch: { status: done ? 'todo' : 'done' } })}
    >
      <Check size={14} strokeWidth={3} aria-hidden />
    </button>
  );
}

export function TaskRow({ task, today, area, showPlan = false, actions }: Props) {
  const closed = task.status === 'done' || task.status === 'cancelled';
  const deadline = task.deadline && !closed ? deadlineTag(task.deadline, today) : null;
  const plan = task.plannedDate && !closed ? planTag(task.plannedDate, today) : null;
  const carried = carriedFrom(task, today) !== null;
  const { done, total } = checklistProgress(task);

  return (
    <li className={closed ? 'task-row task-row--closed' : 'task-row'}>
      <TaskCheck task={task} />
      <div className="task-row__main">
        <Link to={`/tasks/${task.id}`} className="task-row__title">
          {task.title}
        </Link>
        <div className="task-row__meta">
          {task.status === 'cancelled' && <span>отменена</span>}
          {task.important && !closed && (
            <span className="task-row__important">
              <Flag size={12} strokeWidth={2.2} aria-hidden /> важно
            </span>
          )}
          {deadline && <span className={deadline.tone ? `tag tag--${deadline.tone}` : undefined}>{deadline.text}</span>}
          {plan && (showPlan || carried) && <span>{plan}</span>}
          {total > 0 && (
            <span className="num">
              <ListChecks size={13} aria-hidden /> {done}/{total}
            </span>
          )}
          {area && (
            <span className={`task-row__area tone-${area.color}`}>
              <span className="nav__dot" aria-hidden /> {area.name}
            </span>
          )}
        </div>
      </div>
      {actions}
    </li>
  );
}

import { Link } from 'react-router-dom';
import { currentMilestone, nextStep, PROJECT_STATUSES, projectProgress, workTask } from '../../domain/projects';
import type { Area, Goal, Project, Task } from '../../domain/types';
import { formatShort, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { AreaMark } from '../AreaIcon';
import { ProgressBar } from '../ProgressBar';
import { deadlineTag } from '../tasks/taskText';

interface Props {
  project: Project;
  /** Задачи этого проекта. */
  tasks: Task[];
  area: Area | undefined;
  goal: Goal | undefined;
  today: IsoDate;
}

/** «веха 2 из 3: Writing» — первая неготовая веха. */
function milestoneText(project: Project, tasks: Task[], today: IsoDate): string | null {
  const current = currentMilestone(project, tasks, today);
  if (current === null) return null;
  if (current === 'done') return 'все вехи пройдены';
  return `веха ${current.number} из ${project.milestones.length}: ${current.milestone.title}`;
}

export function ProjectCard({ project, tasks, area, goal, today }: Props) {
  const progress = projectProgress(tasks);
  const next = project.status === 'active' ? nextStep(project, tasks, today) : null;
  const milestone = milestoneText(project, tasks, today);
  // Срок проекта и так виден в шапке карточки, а срок вехи у следующего шага — подсказка, когда его сделать.
  const due = next ? workTask(next, project) : null;
  const nextDeadline = due?.deadline && due.deadlineFrom !== 'project' ? deadlineTag(due.deadline, today, due.deadlineFrom) : null;
  const meta = [
    area?.name,
    project.deadline && `до ${formatShort(project.deadline)}`,
    goal && `${goal.kind === 'habit' ? 'привычка' : 'цель'}: ${goal.title}`,
  ].filter(Boolean);

  return (
    <article className={project.status === 'active' ? 'card project-card' : 'card project-card project-card--quiet'}>
      <div className="goal-card__head">
        <AreaMark area={area} size="sm" />
        <div className="spacer">
          <Link to={`/projects/${project.id}`} className="goal-card__title">
            {project.title}
          </Link>
          {meta.length > 0 && <div className="goal-card__meta">{meta.join(' · ')}</div>}
        </div>
        {project.status !== 'active' && <span className="badge">{PROJECT_STATUSES[project.status]}</span>}
      </div>

      <div>
        <ProgressBar
          percent={progress.total ? (progress.done / progress.total) * 100 : 0}
          tone={progress.total > 0 && progress.open === 0 ? 'good' : 'accent'}
        />
        <div className="goal-card__numbers">
          <span>
            <strong>{progress.done}</strong>{' '}
            <span className="muted">
              из {progress.total} {plural(progress.total, ['задачи', 'задач', 'задач'])}
            </span>
          </span>
          {milestone && <span className="muted">{milestone}</span>}
        </div>
      </div>

      {project.status === 'active' &&
        (next ? (
          <p className="project-card__next small">
            <span className="muted">Следующий шаг:</span> <Link to={`/tasks/${next.id}`}>{next.title}</Link>
            {nextDeadline && <span className={nextDeadline.tone ? ` tag--${nextDeadline.tone}` : ' muted'}> · {nextDeadline.text}</span>}
          </p>
        ) : (
          <p className="project-card__stalled small">
            {progress.total > 0 && progress.open === 0
              ? 'Все задачи сделаны — можно завершать проект.'
              : 'Нет следующего шага. Добавьте задачу, иначе проект встанет.'}
          </p>
        ))}
    </article>
  );
}

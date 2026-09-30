import { CircleCheck, FolderKanban, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useAreaMap,
  useAreas,
  useCreateProject,
  useCreateTask,
  useDeleteProject,
  useGoalsWithStats,
  useToday,
  useUpdateProject,
  useWork,
} from '../../api/hooks';
import { BackButton } from '../../components/BackButton';
import { describePace } from '../../components/pace';
import { ProgressBar } from '../../components/ProgressBar';
import { ProjectForm, type ProjectFields } from '../../components/projects/ProjectForm';
import { TaskRow } from '../../components/tasks/TaskRow';
import { deadlineTag } from '../../components/tasks/taskText';
import { useGoBack } from '../../components/useGoBack';
import {
  compareProjectTasks,
  isReadyToFinish,
  isStalled,
  milestoneState,
  nextStep,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUSES,
  projectProgress,
} from '../../domain/projects';
import { taskInput } from '../../domain/tasks';
import type { Area, Milestone, Project, ProjectStatus, Task } from '../../domain/types';
import { formatShort, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState, NotFoundState } from '../states';

const tasksWord = (n: number) => plural(n, ['задача', 'задачи', 'задач']);

/** Добавить задачу прямо в веху (или в проект без вехи). */
function AddTask({ project, milestone }: { project: Project; milestone: Milestone | null }) {
  const create = useCreateTask();
  const [title, setTitle] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    create.mutate(
      taskInput({ title: text, projectId: project.id, milestoneId: milestone?.id ?? null, areaId: project.areaId }),
      { onSuccess: () => setTitle('') },
    );
  }

  const label = milestone ? `Новая задача в «${milestone.title}»` : 'Новая задача проекта';
  return (
    <form className="today-tasks__add milestone__add" onSubmit={submit}>
      <input className="input" placeholder="Добавить задачу" aria-label={label} value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="btn btn--sm" type="submit" disabled={!title.trim() || create.isPending} aria-label="Добавить">
        <Plus size={15} aria-hidden />
      </button>
    </form>
  );
}

interface SectionProps {
  project: Project;
  milestone: Milestone | null;
  /** Задачи этой вехи (или без вехи). */
  tasks: Task[];
  today: IsoDate;
  areas: Map<string, Area>;
  title: string;
}

function TaskSection({ project, milestone, tasks, today, areas, title }: SectionProps) {
  const state = milestone ? milestoneState(milestone, tasks, today) : null;
  const deadline = milestone?.deadline && !state?.completed ? deadlineTag(milestone.deadline, today) : null;
  const open = tasks.filter((t) => t.status === 'todo' || t.status === 'inbox').sort(compareProjectTasks(project, today));
  const closed = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled');

  return (
    <section className={state?.completed ? 'card milestone milestone--done' : 'card milestone'} aria-label={title}>
      <div className="milestone__head">
        <h3 className="milestone__title">
          {state?.completed && <CircleCheck size={17} strokeWidth={2} aria-hidden />} {title}
        </h3>
        <span className="milestone__meta small">
          {deadline && (
            <span className={state?.overdue ? 'tag--bad' : deadline.tone ? `tag--${deadline.tone}` : undefined}>
              {state?.overdue ? `срок вехи прошёл ${formatShort(milestone?.deadline ?? today)}` : deadline.text}
            </span>
          )}
          {state && state.total > 0 && (
            <span className="num">
              {state.done} из {state.total}
            </span>
          )}
          {state?.completed && <span className="tag--good">готово</span>}
        </span>
      </div>
      {tasks.length > 0 && (
        <ul className="task-list" style={{ padding: 0 }}>
          {[...open, ...closed].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              // Сфера проекта у его задач очевидна — показываем только другую.
              area={task.areaId && task.areaId !== project.areaId ? areas.get(task.areaId) : undefined}
              showPlan
            />
          ))}
        </ul>
      )}
      <AddTask project={project} milestone={milestone} />
    </section>
  );
}

export function ProjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { data, isLoading, error } = useWork();
  const areas = useAreaMap();
  const goals = useGoalsWithStats();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const [pendingStatus, setPendingStatus] = useState<ProjectStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const project = data.projects.find((p) => p.id === id);
  if (!project) return <NotFoundState title="Проект не найден" back="/projects" />;

  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const progress = projectProgress(tasks);
  const next = nextStep(project, tasks, today);
  const area = project.areaId ? areas.get(project.areaId) : undefined;
  const goal = project.goalId ? goals.data?.find((g) => g.goal.id === project.goalId) : undefined;
  const deadline = project.deadline && project.status === 'active' ? deadlineTag(project.deadline, today) : null;
  const milestoneIds = new Set(project.milestones.map((m) => m.id));
  const loose = tasks.filter((t) => t.milestoneId === null || !milestoneIds.has(t.milestoneId));

  function setStatus(status: ProjectStatus) {
    if (!project || status === project.status) return;
    // Завершить проект с открытыми задачами можно, но осознанно: они пропадут из «Сегодня».
    if ((status === 'done' || status === 'dropped') && progress.open > 0 && pendingStatus !== status) {
      setPendingStatus(status);
      return;
    }
    setPendingStatus(null);
    update.mutate({ id: project.id, patch: { status } });
  }

  return (
    <>
      <BackButton fallback="/projects" />
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="page-head__eyebrow">
            <FolderKanban size={13} aria-hidden /> Проект
          </p>
          <h1>{project.title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            {area && <span className={`badge badge--tone tone-${area.color}`}>{area.name}</span>}
            {deadline && <span className={deadline.tone ? `badge badge--${deadline.tone === 'bad' ? 'bad' : 'warn'}` : 'badge'}>{deadline.text}</span>}
          </div>
        </div>
        <Link className="btn btn--sm" to={`/projects/${project.id}/edit`}>
          <Pencil size={14} aria-hidden /> Изменить
        </Link>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack">
          <div className="segmented" role="group" aria-label="Статус проекта">
            {PROJECT_STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                className="chip"
                aria-pressed={project.status === status}
                disabled={update.isPending}
                onClick={() => setStatus(status)}
              >
                {PROJECT_STATUSES[status]}
              </button>
            ))}
          </div>
          {pendingStatus && (
            <div className="confirm confirm--soft">
              <p>
                Открыто ещё {progress.open} {tasksWord(progress.open)}. Они останутся в проекте, но пропадут из «Сегодня»
                и списка задач.
              </p>
              <div className="row">
                <button className="btn btn--sm btn--primary" type="button" onClick={() => setStatus(pendingStatus)}>
                  {pendingStatus === 'done' ? 'Завершить' : 'Отменить проект'}
                </button>
                <button className="btn btn--sm btn--ghost" type="button" onClick={() => setPendingStatus(null)}>
                  Не сейчас
                </button>
              </div>
            </div>
          )}
          {project.status !== 'active' && (
            <p className="muted small">Задачи проекта не показываются в «Сегодня» и списке задач, пока он не в работе.</p>
          )}

          <div>
            <ProgressBar
              percent={progress.total ? (progress.done / progress.total) * 100 : 0}
              tone={progress.total > 0 && progress.open === 0 ? 'good' : 'accent'}
            />
            <div className="goal-card__numbers">
              <span>
                Сделано <strong>{progress.done}</strong> из {progress.total} {plural(progress.total, ['задачи', 'задач', 'задач'])}
              </span>
            </div>
          </div>

          {project.status === 'active' && next && (
            <p className="project-card__next">
              <span className="muted">Следующий шаг:</span> <Link to={`/tasks/${next.id}`}>{next.title}</Link>
            </p>
          )}
          {isReadyToFinish(project, tasks) ? (
            <div className="banner banner--good">
              <CircleCheck size={18} aria-hidden />
              <div className="banner__text spacer">
                <strong>Все задачи сделаны</strong>
                <span>Если проект готов — завершите его. Если нет — добавьте следующий шаг.</span>
              </div>
              <button className="btn btn--sm" type="button" disabled={update.isPending} onClick={() => setStatus('done')}>
                Завершить
              </button>
            </div>
          ) : (
            isStalled(project, tasks) && (
              <p className="project-card__stalled small">Нет следующего шага. Добавьте задачу, иначе проект встанет.</p>
            )
          )}
        </div>

        {goal && (
          <Link to={`/goals/${goal.goal.id}`} className="card project-goal">
            <Target size={18} aria-hidden />
            <span className="spacer">
              <span className="muted small">Цель проекта</span>
              <b>{goal.goal.title}</b>
            </span>
            <span className="project-goal__stats small">
              <span className="num">{Math.floor(goal.stats.percent)}%</span>
              <span className={`pace pace--${describePace(goal.goal, goal.stats).tone}`}>{describePace(goal.goal, goal.stats).text}</span>
            </span>
          </Link>
        )}

        {project.description && (
          <p className="muted" style={{ whiteSpace: 'pre-line', maxWidth: '65ch', margin: 0 }}>
            {project.description}
          </p>
        )}

        {project.milestones.map((milestone, index) => (
          <TaskSection
            key={milestone.id}
            project={project}
            milestone={milestone}
            tasks={tasks.filter((t) => t.milestoneId === milestone.id)}
            today={today}
            areas={areas}
            title={`${index + 1}. ${milestone.title}`}
          />
        ))}
        <TaskSection
          project={project}
          milestone={null}
          tasks={loose}
          today={today}
          areas={areas}
          title={project.milestones.length > 0 ? 'Без вехи' : 'Задачи'}
        />

        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Удалить проект «{project.title}»?{' '}
              {tasks.length > 0
                ? `${tasks.length} ${plural(tasks.length, ['задача останется', 'задачи останутся', 'задач останутся'])} без проекта.`
                : 'Задач в нём нет.'}
            </p>
            <div className="row">
              <button
                className="btn btn--sm btn--danger-solid"
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(project.id, { onSuccess: () => navigate('/projects', { replace: true }) })}
              >
                <Trash2 size={14} aria-hidden /> Удалить проект
              </button>
              <button className="btn btn--sm" type="button" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn--sm btn--ghost btn--danger" type="button" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} aria-hidden /> Удалить
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Цели, с которыми можно связать проект: активные, плюс уже связанная. */
function useGoalOptions(currentGoalId: string | null) {
  const goals = useGoalsWithStats();
  const options = (goals.data ?? []).map((g) => g.goal).filter((g) => g.status === 'active' || g.id === currentGoalId);
  return { options, isLoading: goals.isLoading };
}

export function NewProjectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const areas = useAreas();
  const create = useCreateProject();
  const requestedGoal = params.get('goal');
  const goals = useGoalOptions(requestedGoal);
  const goBack = useGoBack('/projects');

  if (areas.isLoading || goals.isLoading) return <LoadingState />;
  if (areas.error || !areas.data) return <ErrorState error={areas.error} />;
  const goal = goals.options.find((g) => g.id === requestedGoal);

  return (
    <>
      <div className="page-head">
        <h1>Новый проект</h1>
      </div>
      <ProjectForm
        areas={areas.data}
        goals={goals.options}
        initial={{ title: '', description: '', areaId: goal?.areaId ?? null, goalId: goal?.id ?? null, deadline: null, milestones: [] }}
        submitLabel="Создать проект"
        isSubmitting={create.isPending}
        onSubmit={(fields: ProjectFields) =>
          create.mutate({ ...fields, status: 'active' }, { onSuccess: (project) => navigate(`/projects/${project.id}`, { replace: true }) })
        }
        onCancel={goBack}
      />
    </>
  );
}

export function EditProjectPage() {
  const { id = '' } = useParams();
  const work = useWork();
  const areas = useAreas();
  const update = useUpdateProject();
  const project = work.data?.projects.find((p) => p.id === id);
  const goals = useGoalOptions(project?.goalId ?? null);
  const goBack = useGoBack(`/projects/${id}`);

  if (work.isLoading || areas.isLoading || goals.isLoading) return <LoadingState />;
  if (work.error || areas.error || !work.data || !areas.data) return <ErrorState error={work.error ?? areas.error} />;
  if (!project) return <NotFoundState title="Проект не найден" back="/projects" />;

  const milestoneTasks = new Map<string, number>();
  for (const task of work.data.tasks) {
    if (task.projectId === project.id && task.milestoneId) milestoneTasks.set(task.milestoneId, (milestoneTasks.get(task.milestoneId) ?? 0) + 1);
  }
  const { title, description, areaId, goalId, deadline, milestones } = project;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{project.title}</h1>
        </div>
      </div>
      <ProjectForm
        areas={areas.data}
        goals={goals.options}
        initial={{ title, description, areaId, goalId, deadline, milestones }}
        milestoneTasks={milestoneTasks}
        submitLabel="Сохранить"
        isSubmitting={update.isPending}
        onSubmit={(fields) => update.mutate({ id, patch: fields }, { onSuccess: goBack })}
        onCancel={goBack}
      />
    </>
  );
}

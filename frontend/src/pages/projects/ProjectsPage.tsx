import { FolderKanban, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAreaMap, useGoals, useToday, useWork } from '../../api/hooks';
import { ProjectCard } from '../../components/projects/ProjectCard';
import { PROJECT_STATUSES } from '../../domain/projects';
import type { Project, ProjectStatus, Task } from '../../domain/types';
import { ErrorState, LoadingState } from '../states';

export function ProjectsPage() {
  const today = useToday();
  const { data, isLoading, error } = useWork();
  const areas = useAreaMap();
  const goals = useGoals();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const tasksByProject = new Map<string, Task[]>();
  for (const task of data.tasks) {
    if (task.projectId) tasksByProject.set(task.projectId, [...(tasksByProject.get(task.projectId) ?? []), task]);
  }
  const goalById = new Map([...(goals.data?.targets ?? []), ...(goals.data?.habits ?? [])].map((g) => [g.goal.id, g.goal]));
  const byStatus = (status: ProjectStatus) =>
    data.projects
      .filter((p) => p.status === status)
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const card = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      tasks={tasksByProject.get(project.id) ?? []}
      area={project.areaId ? areas.get(project.areaId) : undefined}
      goal={project.goalId ? goalById.get(project.goalId) : undefined}
      today={today}
    />
  );
  const closed = [...byStatus('done'), ...byStatus('dropped')].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Большие дела по шагам</p>
          <h1>Проекты</h1>
        </div>
        <Link className="btn btn--primary btn--sm" to="/projects/new">
          <Plus size={15} aria-hidden /> Проект
        </Link>
      </div>

      {data.projects.length === 0 ? (
        <div className="card empty">
          <span className="empty__icon">
            <FolderKanban size={26} strokeWidth={1.8} aria-hidden />
          </span>
          <h2>Проектов пока нет</h2>
          <p className="muted">
            Проект — дело из нескольких шагов: «подготовиться к IELTS», «переехать», «сделать курсовую». Разбейте его на вехи
            и задачи — трекер покажет следующий шаг и не даст проекту встать. Проект можно связать с целью.
          </p>
          <Link className="btn btn--primary" to="/projects/new">
            <Plus size={16} aria-hidden /> Новый проект
          </Link>
        </div>
      ) : (
        <>
          {(['active', 'paused'] as const).map((status) => {
            const list = byStatus(status);
            if (list.length === 0) return null;
            return (
              <section className="section" key={status}>
                <h2 className="section__title">
                  {PROJECT_STATUSES[status]} <span className="section__count">{list.length}</span>
                </h2>
                {status === 'paused' && (
                  <p className="muted small section__hint">Задачи проектов на паузе не показываются в «Сегодня» и списке задач.</p>
                )}
                <div className="stack">{list.map(card)}</div>
              </section>
            );
          })}
          {closed.length > 0 && (
            <details className="details section">
              <summary className="small">Завершённые и отменённые: {closed.length}</summary>
              <div className="stack" style={{ marginTop: 12 }}>
                {closed.map(card)}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

import { PROJECT_STATUSES } from '../../domain/projects';
import type { Project } from '../../domain/types';

interface Props {
  /** Префикс id полей: на одной странице может быть несколько форм. */
  idPrefix: string;
  projects: Project[];
  projectId: string | null;
  milestoneId: string | null;
  onChange: (value: { projectId: string | null; milestoneId: string | null; project: Project | null }) => void;
}

/** Проект и веха задачи. Веху можно выбрать, только если у проекта есть вехи. */
export function ProjectPicker({ idPrefix, projects, projectId, milestoneId, onChange }: Props) {
  const project = projects.find((p) => p.id === projectId) ?? null;
  return (
    <div className="form__row">
      <div className="field">
        <label className="field__label" htmlFor={`${idPrefix}-project`}>
          Проект
        </label>
        <select
          id={`${idPrefix}-project`}
          className="select"
          value={projectId ?? ''}
          onChange={(e) => {
            const next = projects.find((p) => p.id === e.target.value) ?? null;
            onChange({ projectId: next?.id ?? null, milestoneId: null, project: next });
          }}
        >
          <option value="">Без проекта</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.status === 'active' ? p.title : `${p.title} · ${PROJECT_STATUSES[p.status].toLowerCase()}`}
            </option>
          ))}
        </select>
      </div>
      {project && project.milestones.length > 0 && (
        <div className="field">
          <label className="field__label" htmlFor={`${idPrefix}-milestone`}>
            Веха
          </label>
          <select
            id={`${idPrefix}-milestone`}
            className="select"
            value={milestoneId ?? ''}
            onChange={(e) => onChange({ projectId: project.id, milestoneId: e.target.value || null, project })}
          >
            <option value="">Без вехи</option>
            {project.milestones.map((m, index) => (
              <option key={m.id} value={m.id}>
                {index + 1}. {m.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

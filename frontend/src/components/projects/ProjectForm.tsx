import { Plus, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Area, Goal, Milestone, ProjectInput } from '../../domain/types';
import { AREA_ICON_COMPONENTS } from '../areaIcons';

export type ProjectFields = Omit<ProjectInput, 'status'>;

interface Props {
  areas: Area[];
  /** Цели, с которыми можно связать проект. */
  goals: Goal[];
  initial: ProjectFields;
  /** Сколько задач у каждой вехи — чтобы предупредить при удалении вехи. */
  milestoneTasks?: Map<string, number>;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (fields: ProjectFields) => void;
  onCancel: () => void;
}

const newMilestone = (): Milestone => ({ id: crypto.randomUUID(), title: '', deadline: null });

export function ProjectForm({ areas, goals, initial, milestoneTasks, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ProjectFields>(initial);
  const [milestones, setMilestones] = useState<Milestone[]>(initial.milestones);
  const [submitted, setSubmitted] = useState(false);
  const focusId = useRef<string | null>(null);

  const titleError = values.title.trim() ? null : 'Как называется проект?';
  // Веха без названия при сохранении пропадёт — так же, как удалённая.
  const kept = milestones.filter((m) => m.title.trim());
  const removedWithTasks = initial.milestones.filter((m) => !kept.some((x) => x.id === m.id) && (milestoneTasks?.get(m.id) ?? 0) > 0);

  function set<K extends keyof ProjectFields>(key: K, value: ProjectFields[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addMilestone(after: number) {
    const milestone = newMilestone();
    focusId.current = milestone.id;
    setMilestones((prev) => [...prev.slice(0, after + 1), milestone, ...prev.slice(after + 1)]);
  }

  function updateMilestone(id: string, patch: Partial<Milestone>) {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function onMilestoneKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addMilestone(index);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (titleError) return;
    onSubmit({
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      milestones: milestones.map((m) => ({ ...m, title: m.title.trim() })).filter((m) => m.title),
    });
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="project-title">
          Проект
        </label>
        <input
          id="project-title"
          className="input"
          placeholder="Например: подготовиться к IELTS"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={submitted && Boolean(titleError)}
          autoFocus
        />
        {submitted && titleError && <span className="field__error">{titleError}</span>}
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="project-goal">
            Цель
          </label>
          <select
            id="project-goal"
            className="select"
            value={values.goalId ?? ''}
            onChange={(e) => set('goalId', e.target.value || null)}
          >
            <option value="">Без цели</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          <span className="field__hint">Проект — путь, цель — измеримый результат: «IELTS» и «набрать 7.0».</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="project-deadline">
            Срок
          </label>
          <input
            id="project-deadline"
            className="input"
            type="date"
            value={values.deadline ?? ''}
            onChange={(e) => set('deadline', e.target.value || null)}
          />
          <span className="field__hint">Необязательно.</span>
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="project-area-label">
          Сфера
        </span>
        <div className="segmented" role="group" aria-labelledby="project-area-label">
          {areas.map((area) => {
            const Icon = AREA_ICON_COMPONENTS[area.icon];
            return (
              <button
                key={area.id}
                type="button"
                className={`chip chip--tone tone-${area.color}`}
                aria-pressed={values.areaId === area.id}
                onClick={() => set('areaId', area.id)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden /> {area.name}
              </button>
            );
          })}
          <button type="button" className="chip" aria-pressed={values.areaId === null} onClick={() => set('areaId', null)}>
            Без сферы
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="project-milestones-label">
          Вехи
        </span>
        <span className="field__hint">
          Этапы проекта по порядку: «Диагностика», «Writing», «Пробный экзамен». Необязательно — можно добавить позже.
        </span>
        {milestones.length > 0 && (
          <ol className="milestone-inputs" aria-labelledby="project-milestones-label">
            {milestones.map((milestone, index) => (
              <li key={milestone.id} className="milestone-inputs__row">
                <span className="question-inputs__n num" aria-hidden>
                  {index + 1}.
                </span>
                <input
                  ref={(el) => {
                    if (el && focusId.current === milestone.id) {
                      el.focus();
                      focusId.current = null;
                    }
                  }}
                  className="input"
                  placeholder="Название вехи"
                  value={milestone.title}
                  onChange={(e) => updateMilestone(milestone.id, { title: e.target.value })}
                  onKeyDown={(e) => onMilestoneKey(e, index)}
                  aria-label={`Веха ${index + 1}`}
                />
                <input
                  className="input milestone-inputs__date"
                  type="date"
                  value={milestone.deadline ?? ''}
                  onChange={(e) => updateMilestone(milestone.id, { deadline: e.target.value || null })}
                  aria-label={`Срок вехи ${index + 1}`}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`Удалить веху ${index + 1}`}
                  onClick={() => setMilestones((prev) => prev.filter((m) => m.id !== milestone.id))}
                >
                  <X size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addMilestone(milestones.length - 1)}>
            <Plus size={15} aria-hidden /> Добавить веху
          </button>
        </div>
        {removedWithTasks.length > 0 && (
          <p className="notice notice--warn">
            Задачи удалённых вех ({removedWithTasks.map((m) => `«${m.title}»`).join(', ')}) останутся в проекте без вехи.
          </p>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="project-description">
          Описание
        </label>
        <textarea
          id="project-description"
          className="textarea"
          placeholder="Зачем этот проект и как понять, что он готов"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div className="row">
        <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
          {submitLabel}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

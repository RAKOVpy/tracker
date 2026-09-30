import { CircleCheck, NotebookPen, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateTask, useEditParts, useUpdateMaterial } from '../../api/hooks';
import { nextPart, PART_STATUS_ORDER, partStates, partStatusLabel, partsProgress, summaryTaskTitle, type PartState } from '../../domain/parts';
import { taskInput } from '../../domain/tasks';
import type { Material, MaterialPart, PartStatus, Task } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ProgressBar } from '../ProgressBar';
import { ParsedChips } from '../tasks/ParsedChips';
import { deadlineTag, planTag } from '../tasks/taskText';
import { useTaskParser } from '../tasks/useTaskParser';
import { PartsGenerator } from './PartsGenerator';

interface Props {
  material: Material;
  /** Все задачи: у части может быть задача-конспект. */
  tasks: Task[];
  today: IsoDate;
}

/** «конспект до пт», «конспект завтра», «конспект без даты». */
function taskWhen(task: Task, today: IsoDate): string {
  if (task.deadline) return deadlineTag(task.deadline, today).text;
  if (task.plannedDate) return planTag(task.plannedDate, today) ?? 'сегодня';
  return 'без даты';
}

/** Конспект части — задача: название уже подставлено, остаётся дописать срок словами. */
function PlanSummary({ material, part, today, onClose }: { material: Material; part: MaterialPart; today: IsoDate; onClose: () => void }) {
  const create = useCreateTask();
  const [title, setTitle] = useState(`${summaryTaskTitle(part)} `);
  // Часть уже выбрана — «#» ищет только сферы.
  const { parsed, dismiss } = useTaskParser(title, { projects: false });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.title) return;
    create.mutate(
      taskInput({
        title: parsed.title,
        plannedDate: parsed.plannedDate,
        deadline: parsed.deadline,
        recurrence: parsed.recurrence,
        important: parsed.important,
        areaId: parsed.areaId ?? material.areaId,
        materialId: material.id,
        partId: part.id,
      }),
      { onSuccess: onClose },
    );
  }

  return (
    <form className="part-plan" onSubmit={submit}>
      <input
        className="input"
        aria-label={`Задача-конспект: ${part.title}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        // Курсор — в конец, сразу за названием: остаётся дописать «до пт».
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <ParsedChips parsed={parsed} today={today} onDismiss={dismiss} />
      <div className="row">
        <button className="btn btn--primary btn--sm" type="submit" disabled={!parsed.title || create.isPending}>
          В задачи
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
          Отмена
        </button>
        <span className="muted small">Допишите срок словами: «завтра», «до пт», «к 15 окт».</span>
      </div>
    </form>
  );
}

function PartRow({
  material,
  state,
  isNext,
  prominent,
  planning,
  today,
  onPlan,
  onStatus,
}: {
  material: Material;
  state: PartState;
  isNext: boolean;
  /** Первая часть без конспекта в планах: кнопка «Конспект» заметная, у остальных — значок. */
  prominent: boolean;
  planning: boolean;
  today: IsoDate;
  onPlan: (open: boolean) => void;
  onStatus: (status: PartStatus) => void;
}) {
  const { part, status, byTask, task } = state;
  return (
    <li className={`part-row part-row--${status}${isNext ? ' part-row--next' : ''}`}>
      <div className="part-row__main">
        <select
          className={`part-status part-status--${status}`}
          value={status}
          disabled={byTask}
          title={byTask ? 'Задача-конспект сделана' : undefined}
          aria-label={`Статус: ${part.title}`}
          onChange={(e) => onStatus(e.target.value as PartStatus)}
        >
          {PART_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {partStatusLabel(s, material.type)}
            </option>
          ))}
        </select>
        <span className="part-row__title">
          {status === 'summarized' && <CircleCheck size={15} aria-hidden />} {part.title}
          {isNext && <span className="part-row__next">следующая</span>}
        </span>
        {task ? (
          <Link className="part-row__task small" to={`/tasks/${task.id}`}>
            <NotebookPen size={14} aria-hidden /> конспект {taskWhen(task, today)}
          </Link>
        ) : (
          status !== 'summarized' &&
          !planning &&
          // У ближайшей части — заметная кнопка, у остальных — значок, чтобы список не пестрел.
          (prominent ? (
            <button className="btn btn--sm part-row__plan" type="button" onClick={() => onPlan(true)}>
              <NotebookPen size={14} aria-hidden /> Конспект
            </button>
          ) : (
            <button
              className="icon-btn part-row__plan"
              type="button"
              aria-label={`Запланировать конспект: ${part.title}`}
              title="Запланировать конспект"
              onClick={() => onPlan(true)}
            >
              <NotebookPen size={15} aria-hidden />
            </button>
          ))
        )}
      </div>
      {planning && <PlanSummary material={material} part={part} today={today} onClose={() => onPlan(false)} />}
    </li>
  );
}

/**
 * Части материала на его странице: статус каждой, задача-конспект, следующая часть.
 * Когда законспектировано всё — предложение отметить материал изученным.
 */
export function PartsSection({ material, tasks, today }: Props) {
  const { edit } = useEditParts();
  const updateMaterial = useUpdateMaterial();
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const states = partStates(material, tasks, today);
  const progress = partsProgress(states);
  const next = nextPart(states);
  const firstUnplanned = states.find((s) => s.status !== 'summarized' && s.task === null);
  const allDone = progress.total > 0 && progress.summarized === progress.total;

  function addPart(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    edit(material, (parts) => [...parts, { id: crypto.randomUUID(), title, status: 'todo' }]);
    setNewTitle('');
  }

  const setStatus = (id: string, status: PartStatus) => edit(material, (parts) => parts.map((p) => (p.id === id ? { ...p, status } : p)));

  return (
    <section className="card stack" aria-labelledby="parts-title">
      <div className="panel-head">
        <h2 className="section__title" id="parts-title" style={{ margin: 0 }}>
          Части{' '}
          {progress.total > 0 && (
            <span className="section__count">
              {progress.summarized} из {progress.total} {plural(progress.total, ['законспектирована', 'законспектированы', 'законспектировано'])}
            </span>
          )}
        </h2>
        {progress.total > 0 && (
          <Link className="btn btn--sm btn--ghost" to={`/knowledge/materials/${material.id}/edit#parts`}>
            <Pencil size={14} aria-hidden /> Изменить
          </Link>
        )}
      </div>

      {progress.total === 0 ? (
        <>
          <p className="muted">
            Разбейте материал на части — главы, лекции, уроки. Так видно, сколько пройдено, а конспект каждой части можно
            запланировать задачей: она появится в «Сегодня».
          </p>
          <PartsGenerator
            idPrefix="parts-quick"
            type={material.type}
            existing={material.parts}
            onAdd={(added) => edit(material, (parts) => [...parts, ...added])}
          />
        </>
      ) : (
        <>
          <ProgressBar percent={(progress.summarized / progress.total) * 100} tone={allDone ? 'good' : 'accent'} />
          {allDone && material.status !== 'done' && (
            <div className="banner banner--good">
              <CircleCheck size={18} aria-hidden />
              <div className="banner__text spacer">
                <strong>Все части законспектированы</strong>
                <span>Если материал пройден — отметьте его изученным. Заметки останутся в повторении.</span>
              </div>
              <button
                className="btn btn--sm"
                type="button"
                disabled={updateMaterial.isPending}
                onClick={() => updateMaterial.mutate({ id: material.id, patch: { status: 'done' } })}
              >
                Изучено
              </button>
            </div>
          )}
          <ol className="part-list">
            {states.map((state) => (
              <PartRow
                key={state.part.id}
                material={material}
                state={state}
                isNext={!allDone && state === next}
                prominent={state === firstUnplanned}
                planning={planningId === state.part.id}
                today={today}
                onPlan={(open) => setPlanningId(open ? state.part.id : null)}
                onStatus={(status) => setStatus(state.part.id, status)}
              />
            ))}
          </ol>
        </>
      )}

      {progress.total > 0 && (
        <form className="today-tasks__add milestone__add" onSubmit={addPart}>
          <input
            className="input"
            placeholder="Добавить часть"
            aria-label="Новая часть"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button className="btn btn--sm" type="submit" disabled={!newTitle.trim()} aria-label="Добавить часть">
            <Plus size={15} aria-hidden />
          </button>
        </form>
      )}
    </section>
  );
}

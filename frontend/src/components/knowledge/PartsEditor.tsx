import { Plus, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import type { MaterialPart, MaterialType } from '../../domain/types';
import { PartsGenerator } from './PartsGenerator';

interface Props {
  type: MaterialType;
  parts: MaterialPart[];
  /** Части, как они были до правки, и сколько у каждой задач — чтобы предупредить при удалении. */
  initial: MaterialPart[];
  partTasks?: Map<string, number>;
  onChange: (parts: MaterialPart[]) => void;
}

const newPart = (): MaterialPart => ({ id: crypto.randomUUID(), title: '', status: 'todo' });

/** Части материала в форме: по порядку, Enter добавляет следующую, пустые при сохранении пропадают. */
export function PartsEditor({ type, parts, initial, partTasks, onChange }: Props) {
  const focusId = useRef<string | null>(null);
  const kept = parts.filter((p) => p.title.trim());
  const removedWithTasks = initial.filter((p) => !kept.some((x) => x.id === p.id) && (partTasks?.get(p.id) ?? 0) > 0);

  function add(after: number) {
    const part = newPart();
    focusId.current = part.id;
    onChange([...parts.slice(0, after + 1), part, ...parts.slice(after + 1)]);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      add(index);
    }
  }

  return (
    <div className="field" id="parts">
      <span className="field__label" id="material-parts-label">
        Части
      </span>
      <span className="field__hint">
        Главы, лекции или уроки по порядку. Для каждой можно запланировать конспект — он появится в задачах. Необязательно.
      </span>
      {parts.length > 0 && (
        <ol className="milestone-inputs" aria-labelledby="material-parts-label">
          {parts.map((part, index) => (
            <li key={part.id} className="milestone-inputs__row parts-inputs__row">
              <span className="question-inputs__n num" aria-hidden>
                {index + 1}.
              </span>
              <input
                ref={(el) => {
                  if (el && focusId.current === part.id) {
                    el.focus();
                    focusId.current = null;
                  }
                }}
                className="input"
                placeholder="Название части"
                value={part.title}
                onChange={(e) => onChange(parts.map((p) => (p.id === part.id ? { ...p, title: e.target.value } : p)))}
                onKeyDown={(e) => onKey(e, index)}
                aria-label={`Часть ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Удалить часть ${index + 1}`}
                onClick={() => onChange(parts.filter((p) => p.id !== part.id))}
              >
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => add(parts.length - 1)}>
          <Plus size={15} aria-hidden /> Добавить часть
        </button>
      </div>
      <PartsGenerator
        // Сменили тип материала — у книги главы, у курса уроки.
        key={type}
        idPrefix="material-parts"
        type={type}
        existing={kept}
        onAdd={(added) => onChange([...kept, ...added])}
      />
      {removedWithTasks.length > 0 && (
        <p className="notice notice--warn">
          Задачи удалённых частей ({removedWithTasks.map((p) => `«${p.title}»`).join(', ')}) останутся у материала без части.
        </p>
      )}
    </div>
  );
}

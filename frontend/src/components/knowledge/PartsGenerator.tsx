import { ListPlus } from 'lucide-react';
import { useState } from 'react';
import { numberedParts, PART_PREFIX } from '../../domain/parts';
import type { MaterialPart, MaterialType } from '../../domain/types';
import { NumberStepper } from '../NumberStepper';

interface Props {
  /** Префикс id полей: генератор бывает и на странице материала, и в форме. */
  idPrefix: string;
  type: MaterialType;
  existing: MaterialPart[];
  onAdd: (parts: MaterialPart[]) => void;
}

const MAX_PARTS = 100;

/** Название последней нумерованной части: после «Лекция 8» предлагаем лекции, а не уроки. */
function lastPrefix(parts: MaterialPart[]): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = /^(.*\S)\s+\d+$/.exec(parts[i].title.trim());
    if (match) return match[1];
  }
  return null;
}

/** «Глава 1» … «Глава 12» одним нажатием: нумерация продолжает уже добавленные части. */
export function PartsGenerator({ idPrefix, type, existing, onAdd }: Props) {
  const [prefix, setPrefix] = useState(() => lastPrefix(existing) ?? PART_PREFIX[type]);
  const [count, setCount] = useState(10);
  const name = prefix.trim();
  const preview = numberedParts(existing, name || PART_PREFIX[type], count, () => '');
  // «Глава 1–10».
  const add = () => onAdd(numberedParts(existing, name, count, () => crypto.randomUUID()));
  const range = preview.length === 1 ? preview[0].title : `${preview[0].title}–${preview[preview.length - 1].title.split(' ').pop()}`;

  return (
    <div className="parts-generator">
      <span className="small">Сразу несколько:</span>
      <input
        id={`${idPrefix}-prefix`}
        className="input parts-generator__prefix"
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        // Генератор бывает внутри формы материала: Enter добавляет части, а не сохраняет форму.
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (name) add();
          }
        }}
        aria-label="Как называются части"
      />
      <NumberStepper id={`${idPrefix}-count`} value={count} min={1} max={MAX_PARTS} label="сколько частей" onChange={setCount} />
      <button
        type="button"
        className="btn btn--sm"
        disabled={!name}
        onClick={add}
      >
        <ListPlus size={15} aria-hidden /> Добавить: {range}
      </button>
    </div>
  );
}

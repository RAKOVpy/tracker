import { Link } from 'react-router-dom';
import { MATERIAL_TYPES } from '../../domain/meta';
import { partsProgress, partStates } from '../../domain/parts';
import type { NoteWithState } from '../../domain/review';
import type { Area, Material, Task } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ProgressBar } from '../ProgressBar';
import { MATERIAL_ICONS } from './format';

interface Props {
  material: Material;
  area: Area | undefined;
  notes: NoteWithState[];
  /** Задачи материала: сделанный конспект засчитывает часть. */
  tasks: Task[];
  today: IsoDate;
}

export function MaterialCard({ material, area, notes, tasks, today }: Props) {
  const Icon = MATERIAL_ICONS[material.type];
  const due = notes.filter((n) => n.isDue).length;
  const confident = notes.filter((n) => n.state.level >= 3).length;
  const parts = partsProgress(partStates(material, tasks, today));

  return (
    <Link to={`/knowledge/materials/${material.id}`} className="card material-card">
      <span className={area ? `area-mark tone-${area.color}` : 'area-mark'} aria-hidden>
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="material-card__body">
        <span className="material-card__title">{material.title}</span>
        <span className="muted small">
          {[MATERIAL_TYPES[material.type], material.author, area?.name].filter(Boolean).join(' · ')}
        </span>
        {parts.total > 0 && (
          <span className="material-card__parts small" title="Сколько частей законспектировано">
            <ProgressBar percent={(parts.summarized / parts.total) * 100} tone={parts.summarized === parts.total ? 'good' : 'accent'} />
            <span className="muted num">
              конспекты: {parts.summarized} из {parts.total}
            </span>
          </span>
        )}
        <span className="material-card__stats small">
          <span>
            {notes.length} {plural(notes.length, ['заметка', 'заметки', 'заметок'])}
          </span>
          {confident > 0 && <span className="muted">уверенно помню {confident}</span>}
          {due > 0 && <span className="badge badge--accent">{due} к повторению</span>}
        </span>
      </span>
    </Link>
  );
}

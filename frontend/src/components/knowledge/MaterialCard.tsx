import { Link } from 'react-router-dom';
import { MATERIAL_TYPES } from '../../domain/meta';
import type { NoteWithState } from '../../domain/review';
import type { Area, Material } from '../../domain/types';
import { plural } from '../../lib/format';
import { MATERIAL_ICONS } from './format';

interface Props {
  material: Material;
  area: Area | undefined;
  notes: NoteWithState[];
}

export function MaterialCard({ material, area, notes }: Props) {
  const Icon = MATERIAL_ICONS[material.type];
  const due = notes.filter((n) => n.isDue).length;
  const confident = notes.filter((n) => n.state.level >= 3).length;

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

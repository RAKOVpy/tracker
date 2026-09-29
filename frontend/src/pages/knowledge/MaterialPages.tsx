import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAreaMap, useAreas, useCreateMaterial, useDeleteMaterial, useKnowledge, useUpdateMaterial } from '../../api/hooks';
import { BackButton } from '../../components/BackButton';
import { MATERIAL_ICONS } from '../../components/knowledge/format';
import { MaterialForm } from '../../components/knowledge/MaterialForm';
import { NoteRow } from '../../components/knowledge/parts';
import { MATERIAL_STATUSES, MATERIAL_STATUS_ORDER, MATERIAL_TYPES } from '../../domain/meta';
import type { MaterialInput } from '../../domain/types';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState, NotFoundState } from '../states';

export function MaterialPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, today, isLoading, error } = useKnowledge();
  const areas = useAreaMap();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const material = data.materials.find((m) => m.id === id);
  if (!material) return <NotFoundState title="Материал не найден" back="/knowledge" />;

  const area = material.areaId ? areas.get(material.areaId) : undefined;
  const notes = data.notes
    .filter((n) => n.note.materialId === material.id)
    .sort((a, b) => a.state.dueDate.localeCompare(b.state.dueDate));
  const Icon = MATERIAL_ICONS[material.type];

  return (
    <>
      <BackButton fallback="/knowledge" />
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div className="goal-card__head">
          <span className={area ? `area-mark tone-${area.color}` : 'area-mark'} aria-hidden>
            <Icon size={20} strokeWidth={1.8} />
          </span>
          <div>
            <h1>{material.title}</h1>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge">{MATERIAL_TYPES[material.type]}</span>
              {material.author && <span className="badge">{material.author}</span>}
              {area && <span className={`badge badge--tone tone-${area.color}`}>{area.name}</span>}
            </div>
          </div>
        </div>
        <Link className="btn btn--sm" to={`/knowledge/materials/${material.id}/edit`}>
          <Pencil size={14} aria-hidden /> Изменить
        </Link>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack">
          <div className="segmented" role="group" aria-label="Статус материала">
            {MATERIAL_STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                className="chip"
                aria-pressed={material.status === status}
                disabled={updateMaterial.isPending}
                onClick={() => updateMaterial.mutate({ id: material.id, patch: { status } })}
              >
                {MATERIAL_STATUSES[status]}
              </button>
            ))}
          </div>
          {material.url && (
            <a className="external-link small" href={material.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> {material.url}
            </a>
          )}
        </div>

        <section className="card stack">
          <div className="panel-head">
            <h2 className="section__title" style={{ margin: 0 }}>
              Заметки <span className="section__count">{notes.length}</span>
            </h2>
            <Link className="btn btn--sm" to={`/knowledge/notes/new?material=${material.id}`}>
              <Plus size={15} aria-hidden /> Заметка
            </Link>
          </div>
          {notes.length === 0 ? (
            <p className="muted">
              Заметок по этому материалу пока нет. Законспектируйте главу или лекцию и добавьте заметку с вопросами.
            </p>
          ) : (
            <ul className="note-list">
              {notes.map((item) => (
                <NoteRow key={item.note.id} item={item} today={today} />
              ))}
            </ul>
          )}
        </section>

        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Удалить материал «{material.title}»?{' '}
              {notes.length > 0
                ? `${notes.length} ${plural(notes.length, ['заметка останется', 'заметки останутся', 'заметок останутся'])} без материала, повторения не пропадут.`
                : 'Заметок у него нет.'}
            </p>
            <div className="row">
              <button
                className="btn btn--sm btn--danger-solid"
                type="button"
                disabled={deleteMaterial.isPending}
                onClick={() => deleteMaterial.mutate(material.id, { onSuccess: () => navigate('/knowledge') })}
              >
                <Trash2 size={14} aria-hidden /> Удалить материал
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

export function NewMaterialPage() {
  const navigate = useNavigate();
  const areas = useAreas();
  const createMaterial = useCreateMaterial();

  if (areas.isLoading) return <LoadingState />;
  if (areas.error || !areas.data) return <ErrorState error={areas.error} />;

  return (
    <>
      <div className="page-head">
        <h1>Новый материал</h1>
      </div>
      <MaterialForm
        areas={areas.data}
        submitLabel="Добавить материал"
        isSubmitting={createMaterial.isPending}
        onSubmit={(input) =>
          createMaterial.mutate(input, { onSuccess: (m) => navigate(`/knowledge/materials/${m.id}`, { replace: true }) })
        }
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

export function EditMaterialPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const knowledge = useKnowledge();
  const areas = useAreas();
  const updateMaterial = useUpdateMaterial();

  if (knowledge.isLoading || areas.isLoading) return <LoadingState />;
  if (knowledge.error || areas.error || !knowledge.data || !areas.data) {
    return <ErrorState error={knowledge.error ?? areas.error} />;
  }
  const material = knowledge.data.materials.find((m) => m.id === id);
  if (!material) return <NotFoundState title="Материал не найден" back="/knowledge" />;

  const initial: MaterialInput = {
    title: material.title,
    type: material.type,
    author: material.author,
    url: material.url,
    areaId: material.areaId,
    status: material.status,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{material.title}</h1>
        </div>
      </div>
      <MaterialForm
        areas={areas.data}
        initial={initial}
        submitLabel="Сохранить"
        isSubmitting={updateMaterial.isPending}
        onSubmit={(patch) =>
          updateMaterial.mutate({ id, patch }, { onSuccess: () => navigate(`/knowledge/materials/${id}`, { replace: true }) })
        }
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

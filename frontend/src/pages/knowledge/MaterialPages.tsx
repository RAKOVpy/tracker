import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  startCheckFor,
  useAreaMap,
  useAreas,
  useCreateMaterial,
  useDeleteMaterial,
  useKnowledge,
  useTasks,
  useUpdateMaterial,
} from '../../api/hooks';
import { BackButton } from '../../components/BackButton';
import { useGoBack } from '../../components/useGoBack';
import { MATERIAL_ICONS } from '../../components/knowledge/format';
import { MaterialForm } from '../../components/knowledge/MaterialForm';
import { NoteRow } from '../../components/knowledge/parts';
import { PartsSection } from '../../components/knowledge/PartsSection';
import { StartMaterialConfirm } from '../../components/knowledge/StartMaterial';
import { MATERIAL_STATUSES, MATERIAL_STATUS_ORDER, MATERIAL_TYPES } from '../../domain/meta';
import type { MaterialInput, MaterialStatus } from '../../domain/types';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState, NotFoundState } from '../states';

export function MaterialPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, today, isLoading, error } = useKnowledge();
  const tasks = useTasks();
  const areas = useAreaMap();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);

  if (isLoading || tasks.isLoading) return <LoadingState />;
  if (error || tasks.error || !data || !tasks.data) return <ErrorState error={error ?? tasks.error} />;
  const material = data.materials.find((m) => m.id === id);
  if (!material) return <NotFoundState title="Материал не найден" back="/knowledge" />;
  const materialTasks = tasks.data.filter((t) => t.materialId === material.id);

  const startCheck = startCheckFor(data, material.id);
  const setStatus = (status: MaterialStatus) =>
    updateMaterial.mutate({ id: material.id, patch: { status } }, { onSuccess: () => setConfirmingStart(false) });

  const choose = (status: MaterialStatus) => {
    // Начать новый материал при заполненном лимите или долге можно только осознанно.
    if (status === 'active' && material.status !== 'active' && startCheck.blockers.length > 0) {
      setConfirmingStart(true);
      return;
    }
    setConfirmingStart(false);
    setStatus(status);
  };

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
              {material.obsidianPath && <span className="badge">Из Obsidian</span>}
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
                onClick={() => choose(status)}
              >
                {MATERIAL_STATUSES[status]}
              </button>
            ))}
          </div>
          {confirmingStart && (
            <StartMaterialConfirm
              check={startCheck}
              busy={updateMaterial.isPending}
              onStart={() => setStatus('active')}
              onQueue={material.status === 'queued' ? undefined : () => setStatus('queued')}
              onCancel={() => setConfirmingStart(false)}
            />
          )}
          {material.url && (
            <a className="external-link small" href={material.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> {material.url}
            </a>
          )}
        </div>

        <PartsSection material={material} tasks={tasks.data} today={today} />

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
              {materialTasks.length > 0 &&
                ` ${materialTasks.length} ${plural(materialTasks.length, ['задача останется', 'задачи останутся', 'задач останутся'])} без материала.`}
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
  const knowledge = useKnowledge();
  const createMaterial = useCreateMaterial();
  const goBack = useGoBack('/knowledge');

  if (areas.isLoading || knowledge.isLoading) return <LoadingState />;
  if (areas.error || knowledge.error || !areas.data || !knowledge.data) {
    return <ErrorState error={areas.error ?? knowledge.error} />;
  }
  const startCheck = startCheckFor(knowledge.data);
  const initial: MaterialInput = {
    title: '',
    type: 'book',
    author: '',
    url: '',
    areaId: null,
    // Если лимит заполнен или есть долг, новый материал по умолчанию ждёт в очереди.
    status: startCheck.blockers.length > 0 ? 'queued' : 'active',
    parts: [],
  };

  return (
    <>
      <div className="page-head">
        <h1>Новый материал</h1>
      </div>
      <MaterialForm
        areas={areas.data}
        initial={initial}
        startCheck={startCheck}
        submitLabel="Добавить материал"
        isSubmitting={createMaterial.isPending}
        onSubmit={(input) =>
          createMaterial.mutate(input, { onSuccess: (m) => navigate(`/knowledge/materials/${m.id}`, { replace: true }) })
        }
        onCancel={goBack}
      />
    </>
  );
}

export function EditMaterialPage() {
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const knowledge = useKnowledge();
  const areas = useAreas();
  const tasks = useTasks();
  const updateMaterial = useUpdateMaterial();
  const goBack = useGoBack(`/knowledge/materials/${id}`);
  const ready = Boolean(knowledge.data && areas.data && tasks.data);

  // «Изменить» у частей ведёт сразу к ним: /edit#parts.
  useEffect(() => {
    if (ready && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [ready, hash]);

  if (knowledge.isLoading || areas.isLoading || tasks.isLoading) return <LoadingState />;
  if (knowledge.error || areas.error || tasks.error || !knowledge.data || !areas.data || !tasks.data) {
    return <ErrorState error={knowledge.error ?? areas.error ?? tasks.error} />;
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
    parts: material.parts,
  };
  const partTasks = new Map<string, number>();
  for (const task of tasks.data) {
    if (task.materialId === material.id && task.partId) partTasks.set(task.partId, (partTasks.get(task.partId) ?? 0) + 1);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{material.title}</h1>
        </div>
      </div>
      {material.obsidianPath && (
        <p className="notice" style={{ marginBottom: 16 }}>
          Материал взят из Obsidian («{material.obsidianPath}»). Название, тип, автор, ссылка и сфера обновятся из файла при
          следующей синхронизации. Статус меняется только здесь.
        </p>
      )}
      <MaterialForm
        areas={areas.data}
        initial={initial}
        startCheck={material.status === 'active' ? undefined : startCheckFor(knowledge.data, material.id)}
        partTasks={partTasks}
        submitLabel="Сохранить"
        isSubmitting={updateMaterial.isPending}
        onSubmit={(patch) => updateMaterial.mutate({ id, patch }, { onSuccess: goBack })}
        onCancel={goBack}
      />
    </>
  );
}

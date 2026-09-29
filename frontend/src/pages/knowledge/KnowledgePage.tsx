import { useQueryClient } from '@tanstack/react-query';
import { Brain, NotebookPen, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { seedKnowledgeDemo } from '../../api/demo';
import { useAreaMap, useKnowledge } from '../../api/hooks';
import { DueReviewsCard } from '../../components/knowledge/DueReviewsCard';
import { MaterialCard } from '../../components/knowledge/MaterialCard';
import { NoteRow } from '../../components/knowledge/parts';
import { MATERIAL_STATUSES } from '../../domain/meta';
import type { NoteWithState } from '../../domain/review';
import type { Material, MaterialStatus } from '../../domain/types';
import { ErrorState, LoadingState } from '../states';

function EmptyKnowledge() {
  const client = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      await seedKnowledgeDemo();
      await client.invalidateQueries();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="card empty">
      <span className="empty__icon">
        <Brain size={26} strokeWidth={1.8} aria-hidden />
      </span>
      <h2>Здесь будет то, что вы изучаете</h2>
      <p className="muted">
        Добавьте заметку по теме, которую нужно помнить, и 2–3 вопроса к ней. Приложение будет возвращать её на повторение
        через 1, 3, 7, 16 дней и дальше, пока вы не сможете уверенно пересказать тему.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn--primary" to="/knowledge/notes/new">
          <NotebookPen size={16} aria-hidden /> Добавить заметку
        </Link>
        <button className="btn" type="button" onClick={seed} disabled={seeding}>
          <Sparkles size={16} aria-hidden /> Показать пример
        </button>
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const { data, today, isLoading, error } = useKnowledge();
  const areas = useAreaMap();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const { materials, notes, due } = data;
  const notesByMaterial = new Map<string, NoteWithState[]>();
  for (const item of notes) {
    if (!item.note.materialId) continue;
    notesByMaterial.set(item.note.materialId, [...(notesByMaterial.get(item.note.materialId) ?? []), item]);
  }
  const materialTitles = new Map(materials.map((m) => [m.id, m.title]));
  const byStatus = (status: MaterialStatus): Material[] => materials.filter((m) => m.status === status);
  const sortedNotes = [...notes].sort(
    (a, b) =>
      Number(a.note.status === 'paused') - Number(b.note.status === 'paused') ||
      a.state.dueDate.localeCompare(b.state.dueDate),
  );

  const materialSection = (status: MaterialStatus) => {
    const list = byStatus(status);
    if (list.length === 0) return null;
    return (
      <section className="section" key={status}>
        <h2 className="section__title">
          {MATERIAL_STATUSES[status]} <span className="section__count">{list.length}</span>
        </h2>
        <div className="material-grid">
          {list.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              area={m.areaId ? areas.get(m.areaId) : undefined}
              notes={notesByMaterial.get(m.id) ?? []}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Материалы и повторение</p>
          <h1>Знания</h1>
        </div>
        <div className="row">
          <Link className="btn btn--sm" to="/knowledge/materials/new">
            <Plus size={15} aria-hidden /> Материал
          </Link>
          <Link className="btn btn--primary btn--sm" to="/knowledge/notes/new">
            <Plus size={15} aria-hidden /> Заметка
          </Link>
        </div>
      </div>

      {notes.length === 0 && materials.length === 0 ? (
        <EmptyKnowledge />
      ) : (
        <>
          <DueReviewsCard due={due} notes={notes} today={today} showDone />

          {materialSection('active')}
          {materialSection('queued')}

          <section className="section">
            <h2 className="section__title">
              Все заметки <span className="section__count">{notes.length}</span>
            </h2>
            {notes.length === 0 ? (
              <p className="muted">
                Заметок пока нет. <Link to="/knowledge/notes/new">Добавьте первую</Link> — по главе, лекции или теме.
              </p>
            ) : (
              <ul className="card note-list">
                {sortedNotes.map((item) => (
                  <NoteRow
                    key={item.note.id}
                    item={item}
                    today={today}
                    materialTitle={item.note.materialId ? materialTitles.get(item.note.materialId) : undefined}
                  />
                ))}
              </ul>
            )}
          </section>

          {materialSection('done')}
          {materialSection('dropped')}
        </>
      )}
    </>
  );
}

import { Brain, NotebookPen, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { seedKnowledgeDemo } from '../../api/demo';
import { useAreaMap, useKnowledge, useTasks } from '../../api/hooks';
import { DueReviewsCard } from '../../components/knowledge/DueReviewsCard';
import { LoadForecast } from '../../components/knowledge/LoadForecast';
import { MaterialCard } from '../../components/knowledge/MaterialCard';
import { NoteRow } from '../../components/knowledge/parts';
import { SyncButton, SyncPhaseView } from '../../components/obsidian/ObsidianSettings';
import { VacationBanner } from '../../components/VacationBanner';
import { MATERIAL_STATUSES } from '../../domain/meta';
import { useObsidian } from '../../obsidian/useObsidian';
import type { NoteWithState } from '../../domain/review';
import type { Material, MaterialStatus } from '../../domain/types';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState } from '../states';
import { useSeedDemo } from '../../components/useSeedDemo';

function EmptyKnowledge() {
  const { seeding, seed } = useSeedDemo(seedKnowledgeDemo);

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
  const tasks = useTasks();
  const areas = useAreaMap();
  const obsidian = useObsidian();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const { materials, notes, load, forecast, settings } = data;
  const activeCount = materials.filter((m) => m.status === 'active').length;
  const freeSlots = settings.activeMaterialsLimit - activeCount;
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
          {MATERIAL_STATUSES[status]}{' '}
          {status === 'active' ? (
            <span
              className={freeSlots < 0 ? 'section__count section__count--warn' : 'section__count'}
              title="Сколько материалов изучается и лимит из настроек"
            >
              {list.length} из {settings.activeMaterialsLimit}
            </span>
          ) : (
            <span className="section__count">{list.length}</span>
          )}
        </h2>
        {status === 'queued' && (
          <p className="muted small section__hint">
            {freeSlots <= 0
              ? 'Начните, когда закончите или отложите что-то из «Изучаю».'
              : load.inDebt
                ? 'Место в «Изучаю» есть, но сначала лучше разобрать долг повторений.'
                : `Можно начать ещё ${freeSlots} ${plural(freeSlots, ['материал', 'материала', 'материалов'])} — откройте материал и выберите «Изучаю».`}
          </p>
        )}
        {status === 'active' && freeSlots < 0 && (
          <p className="muted small section__hint">
            Изучается больше, чем задано в <Link to="/settings#load">настройках</Link>. Может, что-то стоит отложить?
          </p>
        )}
        <div className="material-grid">
          {list.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              area={m.areaId ? areas.get(m.areaId) : undefined}
              notes={notesByMaterial.get(m.id) ?? []}
              tasks={tasks.data ?? []}
              today={today}
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
          {obsidian.info ? (
            <SyncButton obsidian={obsidian} label="Obsidian" />
          ) : (
            <Link className="btn btn--sm btn--ghost" to="/settings#obsidian">
              Подключить Obsidian
            </Link>
          )}
          <Link className="btn btn--sm" to="/knowledge/materials/new">
            <Plus size={15} aria-hidden /> Материал
          </Link>
          <Link className="btn btn--primary btn--sm" to="/knowledge/notes/new">
            <Plus size={15} aria-hidden /> Заметка
          </Link>
        </div>
      </div>

      {obsidian.phase.kind !== 'idle' && (
        <div style={{ marginBottom: 16 }}>
          <SyncPhaseView phase={obsidian.phase} obsidian={obsidian} />
        </div>
      )}

      {load.vacation && (
        <div className="slot">
          <VacationBanner vacation={load.vacation} />
        </div>
      )}

      {notes.length === 0 && materials.length === 0 ? (
        <EmptyKnowledge />
      ) : (
        <>
          <DueReviewsCard load={load} notes={notes} forecast={forecast} today={today} showDone />
          {!load.vacation && notes.some((n) => n.note.status === 'active') && (
            <div className="slot slot--top">
              <LoadForecast forecast={forecast} budget={settings.dailyReviewLimit} today={today} />
            </div>
          )}

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

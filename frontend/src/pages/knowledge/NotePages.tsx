import { ExternalLink, Pause, Pencil, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCreateNote, useDeleteNote, useDeleteReview, useKnowledge, useUpdateNote } from '../../api/hooks';
import { BackButton } from '../../components/BackButton';
import { formatDue } from '../../components/knowledge/format';
import { LevelLadder } from '../../components/knowledge/parts';
import { NoteForm } from '../../components/knowledge/NoteForm';
import { EXPLAIN_OPTIONS, LEVELS, RATINGS } from '../../domain/review';
import type { NoteInput, Rating, Review } from '../../domain/types';
import { formatLong, formatRelative, formatWeekday, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState, NotFoundState } from '../states';

const RATING_TONE: Record<Rating, string> = { again: 'bad', hard: 'warn', good: 'good', easy: 'good' };

function ReviewHistory({ reviews, today }: { reviews: Review[]; today: IsoDate }) {
  const deleteReview = useDeleteReview();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (reviews.length === 0) return <p className="muted">Повторений пока не было.</p>;
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <ul className="review-history">
      {sorted.map((r) => (
        <li key={r.id} className="review-history__row">
          <span className="review-history__date">
            {formatRelative(r.date, today)} <span className="muted small">{formatWeekday(r.date)}</span>
          </span>
          <span className="spacer row" style={{ gap: 6 }}>
            <span className={`pace pace--${RATING_TONE[r.rating]}`}>{RATINGS.find((x) => x.value === r.rating)?.label}</span>
            {r.explain && (
              <span className="muted small">
                · объяснить: {EXPLAIN_OPTIONS.find((x) => x.value === r.explain)?.label.toLowerCase()}
              </span>
            )}
            {r.taught && <span className="muted small">· объяснил на деле</span>}
          </span>
          {confirmId === r.id ? (
            <span className="row" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn btn--sm btn--danger-solid"
                disabled={deleteReview.isPending}
                onClick={() => deleteReview.mutate(r.id, { onSuccess: () => setConfirmId(null) })}
              >
                Удалить
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirmId(null)}>
                Нет
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              aria-label="Удалить это повторение"
              title="Удалить это повторение"
              onClick={() => setConfirmId(r.id)}
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function NotePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, today, isLoading, error } = useKnowledge();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const item = data.notes.find((n) => n.note.id === id);
  if (!item) return <NotFoundState title="Заметка не найдена" back="/knowledge" />;

  const { note, state, reviews } = item;
  const material = note.materialId ? data.materials.find((m) => m.id === note.materialId) : undefined;
  const paused = note.status === 'paused';
  const fromObsidian = note.obsidianPath !== null;

  return (
    <>
      <BackButton fallback="/knowledge" />
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          {material && (
            <p className="page-head__eyebrow">
              <Link to={`/knowledge/materials/${material.id}`}>{material.title}</Link>
            </p>
          )}
          <h1>{note.title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge badge--accent">
              Уровень {state.level}: {LEVELS[state.level].label}
            </span>
            {fromObsidian && <span className="badge">Из Obsidian</span>}
            {paused && <span className="badge">На паузе</span>}
          </div>
        </div>
        {fromObsidian ? (
          <a className="btn btn--sm" href={note.obsidianUri}>
            <Pencil size={14} aria-hidden /> Изменить в Obsidian
          </a>
        ) : (
          <Link className="btn btn--sm" to={`/knowledge/notes/${note.id}/edit`}>
            <Pencil size={14} aria-hidden /> Изменить
          </Link>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card stack">
          <div className="stats stats--3">
            <div>
              <div className="stat__label">Следующее повторение</div>
              <div className="stat__value">{paused ? 'на паузе' : formatDue(state.dueDate, today)}</div>
              {!paused && <div className="stat__sub">{formatLong(state.dueDate)}</div>}
            </div>
            <div>
              <div className="stat__label">Повторений</div>
              <div className="stat__value">{state.reviewCount}</div>
              <div className="stat__sub">
                {state.lapses > 0 ? `забывал ${state.lapses} ${plural(state.lapses, ['раз', 'раза', 'раз'])}` : 'без забываний'}
              </div>
            </div>
            <div>
              <div className="stat__label">Последний интервал</div>
              <div className="stat__value">{state.lastInterval ? `${state.lastInterval} дн.` : '—'}</div>
              <div className="stat__sub">
                {state.lastReviewed ? `повторял ${formatRelative(state.lastReviewed, today)}` : 'ещё не повторял'}
              </div>
            </div>
          </div>
          <div className="row">
            <Link className="btn btn--primary btn--sm" to={`/review?note=${note.id}`}>
              <RotateCcw size={14} aria-hidden /> Повторить сейчас
            </Link>
            {note.obsidianUri && !fromObsidian && (
              <a className="btn btn--sm" href={note.obsidianUri}>
                <ExternalLink size={14} aria-hidden /> Открыть в Obsidian
              </a>
            )}
          </div>
          {fromObsidian && (
            <p className="muted small">
              Файл «{note.obsidianPath}». Вопросы и суть обновляются из Obsidian при синхронизации.
            </p>
          )}
        </div>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Вопросы для самопроверки
          </h2>
          {note.questions.length > 0 ? (
            <ol className="question-list">
              {note.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Вопросов нет. На повторении нужно будет пересказать тему целиком.{' '}
              {fromObsidian ? (
                'Добавьте в заметку раздел «Вопросы» или выноски > [!question] и синхронизируйте.'
              ) : (
                <Link to={`/knowledge/notes/${note.id}/edit`}>Добавить вопросы</Link>
              )}
            </p>
          )}
          {note.summary && (
            <>
              <h2 className="section__title" style={{ margin: '8px 0 0' }}>
                Ключевые мысли
              </h2>
              <p className="summary-text">{note.summary}</p>
            </>
          )}
        </section>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            Лестница освоения
          </h2>
          <LevelLadder level={state.level} />
          <p className="muted small">
            Уровень растёт от успешных повторений. Четвёртый — после двух повторений подряд с ответом «смог бы объяснить:
            да, уверенно», пятый — когда объясните тему кому-то на деле.
          </p>
        </section>

        <section className="card stack">
          <h2 className="section__title" style={{ margin: 0 }}>
            История повторений
          </h2>
          <ReviewHistory reviews={reviews} today={today} />
        </section>

        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Удалить заметку «{note.title}» вместе с историей повторений?{' '}
              {fromObsidian
                ? 'Файл в Obsidian не изменится. Если у него останется тег review, при следующей синхронизации заметка появится снова, но уже без истории. Чтобы просто не повторять её, лучше приостановите повторения.'
                : 'Отменить это нельзя.'}
            </p>
            <div className="row">
              <button
                className="btn btn--sm btn--danger-solid"
                type="button"
                disabled={deleteNote.isPending}
                onClick={() => deleteNote.mutate(note.id, { onSuccess: () => navigate('/knowledge') })}
              >
                <Trash2 size={14} aria-hidden /> Удалить навсегда
              </button>
              <button className="btn btn--sm" type="button" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button
              className="btn btn--sm"
              type="button"
              disabled={updateNote.isPending}
              onClick={() => updateNote.mutate({ id: note.id, patch: { status: paused ? 'active' : 'paused' } })}
            >
              {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
              {paused ? 'Возобновить повторения' : 'Приостановить повторения'}
            </button>
            <button className="btn btn--sm btn--ghost btn--danger" type="button" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} aria-hidden /> Удалить
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function NewNotePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, isLoading, error } = useKnowledge();
  const createNote = useCreateNote();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const requested = params.get('material');
  const defaultMaterialId = data.materials.some((m) => m.id === requested) ? requested : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Первое повторение — завтра</p>
          <h1>Новая заметка</h1>
        </div>
      </div>
      <NoteForm
        materials={data.materials}
        defaultMaterialId={defaultMaterialId}
        submitLabel="Добавить заметку"
        isSubmitting={createNote.isPending}
        onSubmit={(input) =>
          createNote.mutate(input, { onSuccess: (note) => navigate(`/knowledge/notes/${note.id}`, { replace: true }) })
        }
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

export function EditNotePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useKnowledge();
  const updateNote = useUpdateNote();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const item = data.notes.find((n) => n.note.id === id);
  if (!item) return <NotFoundState title="Заметка не найдена" back="/knowledge" />;

  const { note } = item;
  if (note.obsidianPath !== null) {
    return (
      <div className="card empty">
        <h2>Заметка редактируется в Obsidian</h2>
        <p className="muted">
          Название, вопросы и суть берутся из файла «{note.obsidianPath}». Измените их в Obsidian и нажмите
          «Синхронизировать».
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn btn--primary" href={note.obsidianUri}>
            Открыть в Obsidian
          </a>
          <Link className="btn" to={`/knowledge/notes/${note.id}`}>
            К заметке
          </Link>
        </div>
      </div>
    );
  }
  const initial: NoteInput = {
    title: note.title,
    materialId: note.materialId,
    questions: note.questions,
    summary: note.summary,
    obsidianUri: note.obsidianUri,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{note.title}</h1>
        </div>
      </div>
      <NoteForm
        materials={data.materials}
        initial={initial}
        submitLabel="Сохранить"
        isSubmitting={updateNote.isPending}
        onSubmit={(patch) =>
          updateNote.mutate({ id, patch }, { onSuccess: () => navigate(`/knowledge/notes/${id}`, { replace: true }) })
        }
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

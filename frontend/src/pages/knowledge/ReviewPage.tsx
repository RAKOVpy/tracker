import { ArrowUp, CircleCheck, ExternalLink, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCreateReview, useDeleteReview, useKnowledge } from '../../api/hooks';
import { formatDue } from '../../components/knowledge/format';
import { EXPLAIN_OPTIONS, LEVELS, projectReview, RATINGS, type NoteWithState } from '../../domain/review';
import type { ExplainAnswer, MasteryLevel, Rating } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { ErrorState, LoadingState, NotFoundState } from '../states';

interface Rated {
  reviewId: string;
  noteId: string;
  title: string;
  rating: Rating;
  explain: ExplainAnswer | null;
  taught: boolean;
  levelBefore: MasteryLevel;
  levelAfter: MasteryLevel;
  dueDate: IsoDate;
}

function ratingLabel(rating: Rating): string {
  return RATINGS.find((r) => r.value === rating)?.label ?? rating;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

interface CardProps {
  item: NoteWithState;
  materialTitle: string | undefined;
  today: IsoDate;
  busy: boolean;
  initial: { revealed: boolean; explain: ExplainAnswer | null; taught: boolean };
  onRate: (rating: Rating, explain: ExplainAnswer | null, taught: boolean) => void;
}

/** Карточка одной заметки. Пересоздаётся для каждой заметки (key), поэтому состояние сбрасывается само. */
function ReviewCard({ item, materialTitle, today, busy, initial, onRate }: CardProps) {
  const { note, state, reviews } = item;
  const [revealed, setRevealed] = useState(initial.revealed);
  const [explain, setExplain] = useState<ExplainAnswer | null>(initial.explain);
  const [taught, setTaught] = useState(initial.taught);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (revealed && index !== -1 && !busy) {
        event.preventDefault();
        onRate(RATINGS[index].value, explain, taught);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [revealed, explain, taught, busy, onRate]);

  return (
    <article className="card session">
      <div className="session__note">
        {materialTitle && <span className="muted small">{materialTitle}</span>}
        <h2>{note.title}</h2>
        <span className="badge badge--accent" style={{ justifySelf: 'start' }}>
          Уровень {state.level}: {LEVELS[state.level].label}
        </span>
      </div>

      <p className="session__hint">{LEVELS[state.level].hint}</p>

      {note.questions.length > 0 ? (
        <ol className="question-list question-list--session">
          {note.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      ) : (
        <p className="question-list--session">Перескажите основные мысли темы своими словами.</p>
      )}

      <div className="field">
        <label className="field__label" htmlFor="review-answer">
          Ваш ответ
        </label>
        <textarea
          id="review-answer"
          className="textarea"
          rows={3}
          placeholder="Можно ответить вслух или записать здесь, чтобы потом сверить. Не сохраняется."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </div>

      {!revealed ? (
        <div className="row">
          <button className="btn btn--primary" type="button" onClick={() => setRevealed(true)}>
            Проверить себя
          </button>
          <span className="muted small keyboard-hint">или пробел</span>
        </div>
      ) : (
        <>
          <div className="session__check">
            <span className="field__label">Ключевые мысли</span>
            {note.summary ? (
              <p className="summary-text">{note.summary}</p>
            ) : (
              <p className="muted small">Ключевых мыслей в заметке нет — сверьтесь с конспектом.</p>
            )}
            {note.obsidianUri && (
              <a className="btn btn--sm" href={note.obsidianUri} style={{ justifySelf: 'start' }}>
                <ExternalLink size={14} aria-hidden /> Открыть в Obsidian
              </a>
            )}
          </div>

          <div className="field">
            <span className="field__label" id="explain-label">
              Смог бы объяснить другому? <span className="muted">необязательно</span>
            </span>
            <div className="segmented" role="group" aria-labelledby="explain-label">
              {EXPLAIN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="chip"
                  aria-pressed={explain === option.value}
                  onClick={() => setExplain((current) => (current === option.value ? null : option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={taught} onChange={(e) => setTaught(e.target.checked)} />
              <span>Объяснил эту тему кому-то на деле</span>
            </label>
          </div>

          <div className="field">
            <span className="field__label" id="rating-label">
              Как вспомнилось?
            </span>
            <div className="rates" role="group" aria-labelledby="rating-label">
              {RATINGS.map((rating, i) => {
                const next = projectReview(note, reviews, { rating: rating.value, explain, taught }, today);
                return (
                  <button
                    key={rating.value}
                    type="button"
                    className={`rate rate--${rating.value}`}
                    disabled={busy}
                    onClick={() => onRate(rating.value, explain, taught)}
                  >
                    <b>{rating.label}</b>
                    <small>{formatDue(next.dueDate, today)}</small>
                    <kbd aria-hidden>{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function Finished({ rated, today }: { rated: Rated[]; today: IsoDate }) {
  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="row">
        <CircleCheck size={22} strokeWidth={1.8} className="finished-icon" aria-hidden />
        <h2>
          Повторено {rated.length} {plural(rated.length, ['заметка', 'заметки', 'заметок'])}
        </h2>
      </div>
      <ul className="review-history">
        {rated.map((r) => (
          <li key={r.reviewId} className="review-history__row">
            <Link to={`/knowledge/notes/${r.noteId}`} className="spacer note-row__title">
              {r.title}
            </Link>
            {r.levelAfter > r.levelBefore && (
              <span className="level-up small">
                <ArrowUp size={13} aria-hidden /> уровень {r.levelAfter}
              </span>
            )}
            <span className="muted small">{formatDue(r.dueDate, today)}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <Link className="btn btn--primary" to="/">
          На главную
        </Link>
        <Link className="btn" to="/knowledge">
          К знаниям
        </Link>
      </div>
    </div>
  );
}

export function ReviewPage() {
  const [params] = useSearchParams();
  const singleId = params.get('note');
  const { data, today, isLoading, error } = useKnowledge();
  const createReview = useCreateReview();
  const deleteReview = useDeleteReview();

  // Очередь фиксируется в начале сессии: повторённые заметки не должны исчезать или переставляться на ходу.
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rated, setRated] = useState<Rated[]>([]);
  const [restore, setRestore] = useState<Rated | null>(null);

  if (data && queue === null) {
    setQueue(singleId ? [singleId] : data.due.map((d) => d.note.id));
  }

  if (isLoading || (data && queue === null)) return <LoadingState />;
  if (error || !data || !queue) return <ErrorState error={error} />;

  const notesById = new Map(data.notes.map((n) => [n.note.id, n]));
  const items = queue.map((id) => notesById.get(id)).filter((n): n is NoteWithState => Boolean(n));
  const materialTitles = new Map(data.materials.map((m) => [m.id, m.title]));

  if (singleId && items.length === 0) return <NotFoundState title="Заметка не найдена" back="/knowledge" />;

  if (items.length === 0) {
    return (
      <>
        <div className="page-head">
          <h1>Повторение</h1>
        </div>
        <div className="card empty">
          <span className="empty__icon">
            <CircleCheck size={26} strokeWidth={1.8} aria-hidden />
          </span>
          <h2>Сегодня повторять нечего</h2>
          <p className="muted">Заметки вернутся, когда подойдёт их срок. Можно добавить новую или повторить любую заметку вручную.</p>
          <Link className="btn" to="/knowledge">
            К знаниям
          </Link>
        </div>
      </>
    );
  }

  const finished = index >= items.length;
  const current = finished ? null : items[index];
  const last = rated.at(-1);

  function rate(item: NoteWithState, rating: Rating, explain: ExplainAnswer | null, taught: boolean) {
    const after = projectReview(item.note, item.reviews, { rating, explain, taught }, today);
    createReview.mutate(
      { noteId: item.note.id, date: today, rating, explain, taught },
      {
        onSuccess: (review) => {
          setRated((prev) => [
            ...prev,
            {
              reviewId: review.id,
              noteId: item.note.id,
              title: item.note.title,
              rating,
              explain,
              taught,
              levelBefore: item.state.level,
              levelAfter: after.level,
              dueDate: after.dueDate,
            },
          ]);
          setRestore(null);
          setIndex((i) => i + 1);
        },
      },
    );
  }

  function undo() {
    if (!last) return;
    deleteReview.mutate(last.reviewId, {
      onSuccess: () => {
        setRated((prev) => prev.slice(0, -1));
        setRestore(last);
        setIndex((i) => i - 1);
      },
    });
  }

  return (
    <div className="session-page">
      <div className="session-top">
        <div>
          <p className="page-head__eyebrow">Повторение</p>
          <h1 className="num">{finished ? 'Готово' : `${index + 1} из ${items.length}`}</h1>
        </div>
        {!finished && (
          <Link className="btn btn--sm btn--ghost" to="/knowledge">
            Завершить
          </Link>
        )}
      </div>
      <div className="session-progress" aria-hidden>
        <span style={{ width: `${(Math.min(index, items.length) / items.length) * 100}%` }} />
      </div>

      {last && (
        <div className="session-saved" role="status">
          <span>
            «{last.title}»: {ratingLabel(last.rating).toLowerCase()}, следующее повторение {formatDue(last.dueDate, today)}
            {last.levelAfter > last.levelBefore && `, уровень ${last.levelBefore} → ${last.levelAfter}`}
          </span>
          <button type="button" className="btn btn--sm btn--ghost" disabled={deleteReview.isPending} onClick={undo}>
            <Undo2 size={14} aria-hidden /> Отменить
          </button>
        </div>
      )}

      {current ? (
        <ReviewCard
          key={current.note.id}
          item={current}
          materialTitle={current.note.materialId ? materialTitles.get(current.note.materialId) : undefined}
          today={today}
          busy={createReview.isPending}
          initial={
            restore && restore.noteId === current.note.id
              ? { revealed: true, explain: restore.explain, taught: restore.taught }
              : { revealed: false, explain: null, taught: false }
          }
          onRate={(rating, explain, taught) => rate(current, rating, explain, taught)}
        />
      ) : (
        <Finished rated={rated} today={today} />
      )}
    </div>
  );
}

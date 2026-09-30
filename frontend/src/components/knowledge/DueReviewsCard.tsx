import { Brain, CircleCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { backlogClearedOn, EXTRA_CHUNK, type ForecastDay, type ReviewLoad } from '../../domain/load';
import { estimateMinutes, type NoteWithState } from '../../domain/review';
import { formatShort, type IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { formatDue } from './format';

interface Props {
  load: ReviewLoad;
  notes: NoteWithState[];
  forecast: ForecastDay[];
  today: IsoDate;
  /** Показывать ли карточку «всё повторено», когда повторять нечего. */
  showDone?: boolean;
}

const notesWord = (n: number) => plural(n, ['заметка', 'заметки', 'заметок']);

/** Долг: с прошлых дней ждёт больше дневного лимита. Мягко объясняет, когда он уйдёт. */
function DebtNotice({ load, forecast }: { load: ReviewLoad; forecast: ForecastDay[] }) {
  const cleared = backlogClearedOn(forecast);
  return (
    <p className="review-cta__debt">
      <b>
        Долг: {load.overdue} {notesWord(load.overdue)} с прошлых дней
      </b>{' '}
      — больше дневного лимита ({load.budget}).{' '}
      {cleared
        ? `Если повторять по лимиту, всё разберёте к ${formatShort(cleared)}.`
        : 'За две недели по нынешнему лимиту не разобрать: поднимите лимит в настройках или приостановите часть заметок.'}{' '}
      Новый материал лучше начать, когда долг уйдёт.
    </p>
  );
}

export function DueReviewsCard({ load, notes, forecast, today, showDone = false }: Props) {
  if (load.vacation) return null;
  const { queue, deferred, due } = load;

  if (queue.length > 0) {
    const minutes = estimateMinutes(queue.map((d) => d.note));
    return (
      <div className="card review-cta">
        <span className="review-cta__icon" aria-hidden>
          <Brain size={22} strokeWidth={1.8} />
        </span>
        <div className="spacer">
          <div className="summary__title">
            {queue.length} {notesWord(queue.length)} к повторению
          </div>
          <div className="muted small">
            примерно {minutes} мин
            {load.overdue > 0 && ` · ${load.overdue} ${plural(load.overdue, ['ждёт', 'ждут', 'ждут'])} с прошлых дней`}
          </div>
          {deferred.length > 0 && (
            <div className="muted small">
              Ещё {deferred.length} — на следующие дни: лимит {load.budget} в день
            </div>
          )}
        </div>
        <Link className="btn btn--primary" to="/review">
          Начать повторение
        </Link>
        {load.inDebt && <DebtNotice load={load} forecast={forecast} />}
      </div>
    );
  }

  if (due.length > 0) {
    return (
      <div className="card review-cta review-cta--done">
        <span className="review-cta__icon" aria-hidden>
          <CircleCheck size={22} strokeWidth={1.8} />
        </span>
        <div className="spacer">
          <div className="summary__title">Лимит на сегодня выполнен</div>
          <div className="muted small">
            Повторено {load.reviewedToday}. Ещё {due.length} {plural(due.length, ['ждёт', 'ждут', 'ждут'])} — перенесены на
            следующие дни.
          </div>
        </div>
        <Link className="btn" to="/review?more">
          Повторить ещё {Math.min(EXTRA_CHUNK, due.length)}
        </Link>
        {load.inDebt && <DebtNotice load={load} forecast={forecast} />}
      </div>
    );
  }

  if (!showDone || notes.length === 0) return null;
  const upcoming = notes
    .filter((n) => n.note.status === 'active')
    .map((n) => n.state.dueDate)
    .sort()[0];
  const upcomingCount = notes.filter((n) => n.note.status === 'active' && n.state.dueDate === upcoming).length;
  return (
    <div className="card review-cta review-cta--done">
      <span className="review-cta__icon" aria-hidden>
        <CircleCheck size={22} strokeWidth={1.8} />
      </span>
      <div className="spacer">
        <div className="summary__title">На сегодня всё повторено</div>
        {upcoming && (
          <div className="muted small">
            Следующее повторение {formatDue(upcoming, today)}: {upcomingCount} {notesWord(upcomingCount)}
          </div>
        )}
      </div>
    </div>
  );
}

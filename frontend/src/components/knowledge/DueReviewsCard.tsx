import { Brain, CircleCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { estimateMinutes, type NoteWithState } from '../../domain/review';
import type { IsoDate } from '../../lib/dates';
import { plural } from '../../lib/format';
import { formatDue } from './format';

interface Props {
  due: NoteWithState[];
  notes: NoteWithState[];
  today: IsoDate;
  /** Показывать ли карточку «всё повторено», когда повторять нечего. */
  showDone?: boolean;
}

export function DueReviewsCard({ due, notes, today, showDone = false }: Props) {
  if (due.length === 0) {
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
              Следующее повторение {formatDue(upcoming, today)}: {upcomingCount}{' '}
              {plural(upcomingCount, ['заметка', 'заметки', 'заметок'])}
            </div>
          )}
        </div>
      </div>
    );
  }

  const minutes = estimateMinutes(due.map((d) => d.note));
  const overdue = due.filter((d) => d.overdueDays > 0).length;

  return (
    <div className="card review-cta">
      <span className="review-cta__icon" aria-hidden>
        <Brain size={22} strokeWidth={1.8} />
      </span>
      <div className="spacer">
        <div className="summary__title">
          {due.length} {plural(due.length, ['заметка', 'заметки', 'заметок'])} к повторению
        </div>
        <div className="muted small">
          примерно {minutes} мин
          {overdue > 0 && ` · ${overdue} ${plural(overdue, ['ждёт', 'ждут', 'ждут'])} с прошлых дней`}
        </div>
      </div>
      <Link className="btn btn--primary" to="/review">
        Начать повторение
      </Link>
    </div>
  );
}

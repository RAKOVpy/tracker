import { Check } from 'lucide-react';
import { useEditFocus } from '../../api/hooks';
import type { WeeklyReview } from '../../domain/types';

/** Фокус с отметками: на «Сегодня» и в готовом обзоре. */
export function FocusList({ review, readOnly = false }: { review: WeeklyReview; readOnly?: boolean }) {
  const { edit } = useEditFocus();
  return (
    <ul className="task-list focus-list">
      {review.focus.map((item) => (
        <li key={item.id} className={item.done ? 'task-row task-row--closed' : 'task-row'}>
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={item.done ? `Вернуть: ${item.text}` : `Сделано: ${item.text}`}
            className="task-check"
            disabled={readOnly}
            onClick={() => edit(review, (focus) => focus.map((f) => (f.id === item.id ? { ...f, done: !f.done } : f)))}
          >
            <Check size={14} strokeWidth={3} aria-hidden />
          </button>
          <span className="task-row__main task-row__title">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

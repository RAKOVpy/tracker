import { plural } from '../lib/format';

export interface DayCounts {
  tasksLeft: number;
  tasksDone: number;
  /** Привычки, нужные или начатые сегодня (см. isLeftToday), и отмеченные сегодня. */
  habitsLeft: number;
  habitsDone: number;
  goalsLeft: number;
  goalsDone: number;
  reviewsLeft: number;
  reviewedToday: number;
}

/** Итог дня по всему сразу: задачи, привычки, нормы по целям и повторение (одно дело на все заметки). */
export function summarizeDay(c: DayCounts): { done: number; total: number; title: string; hint: string } {
  const reviewsPending = c.reviewsLeft > 0;
  const reviewsDone = !reviewsPending && c.reviewedToday > 0;
  const left = c.tasksLeft + c.habitsLeft + c.goalsLeft + (reviewsPending ? 1 : 0);
  const done = c.tasksDone + c.habitsDone + c.goalsDone + (reviewsDone ? 1 : 0);
  if (left === 0) return { done, total: done, title: 'На сегодня всё сделано', hint: 'Можно отдохнуть или сделать немного впрок.' };
  const parts = [
    c.tasksLeft > 0 && `${c.tasksLeft} ${plural(c.tasksLeft, ['задача', 'задачи', 'задач'])}`,
    c.habitsLeft > 0 && `${c.habitsLeft} ${plural(c.habitsLeft, ['привычка', 'привычки', 'привычек'])}`,
    c.goalsLeft > 0 && `норма по ${c.goalsLeft} ${plural(c.goalsLeft, ['цели', 'целям', 'целям'])}`,
    reviewsPending && 'повторение',
  ].filter((part): part is string => Boolean(part));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts.at(-1)}` : parts[0];
  return {
    done,
    total: done + left,
    title: `Осталось ${left} ${plural(left, ['дело', 'дела', 'дел'])} на сегодня`,
    hint: `${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
  };
}

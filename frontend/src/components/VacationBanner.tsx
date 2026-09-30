import { TreePalm } from 'lucide-react';
import { useFinishVacation } from '../api/hooks';
import type { Vacation } from '../domain/types';
import { formatDayMonth } from '../lib/dates';

/** Напоминание, что идёт отпуск: повторения и привычки на паузе. */
export function VacationBanner({ vacation }: { vacation: Vacation }) {
  const finish = useFinishVacation();
  return (
    <div className="banner banner--muted vacation-banner" role="status">
      <TreePalm size={18} aria-hidden />
      <div className="banner__text spacer">
        <strong>{vacation.end ? `Вы в отпуске по ${formatDayMonth(vacation.end)}` : 'Вы в отпуске'}</strong>
        <span>
          Повторения и привычки на паузе, дни отпуска не считаются в расписании — после возвращения нагрузка будет как до
          отъезда. Серии целей и привычек не прерываются.
        </span>
      </div>
      <button className="btn btn--sm" type="button" disabled={finish.isPending} onClick={() => finish.mutate(vacation)}>
        Вернуться
      </button>
    </div>
  );
}

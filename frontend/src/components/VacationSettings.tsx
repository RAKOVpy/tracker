import { TreePalm, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateVacation, useDeleteVacation, useFinishVacation, useToday, useVacations } from '../api/hooks';
import type { Vacation } from '../domain/types';
import { currentVacation, vacationDays, vacationError } from '../domain/vacation';
import { addDays, diffDays, type IsoDate } from '../lib/dates';
import { formatDays } from '../lib/format';
import { formatVacation } from './vacationText';

const PRESETS: { label: string; days: number | null }[] = [
  { label: 'Неделя', days: 7 },
  { label: 'Две недели', days: 14 },
  { label: 'Пока не выключу', days: null },
];

function CurrentVacation({ vacation, today }: { vacation: Vacation; today: IsoDate }) {
  const finish = useFinishVacation();
  const left = vacation.end ? diffDays(today, vacation.end) + 1 : null;
  return (
    <div className="vault-status vacation-status">
      <span className="vault-status__name">
        <TreePalm size={16} aria-hidden /> Вы в отпуске: {formatVacation(vacation)}
      </span>
      <span className="muted small">
        {left === null
          ? `Идёт ${formatDays(vacationDays(vacation, today))}, пока вы его не выключите.`
          : left === 1
            ? 'Сегодня последний день.'
            : `Осталось ${formatDays(left)}, включая сегодня.`}
      </span>
      <div>
        <button className="btn btn--sm" type="button" disabled={finish.isPending} onClick={() => finish.mutate(vacation)}>
          Вернуться из отпуска
        </button>
      </div>
    </div>
  );
}

function VacationForm({ vacations, today }: { vacations: Vacation[]; today: IsoDate }) {
  const create = useCreateVacation();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState<IsoDate | null>(addDays(today, 6));
  const [error, setError] = useState<string | null>(null);

  function applyPreset(days: number | null) {
    setEnd(days === null ? null : addDays(start, days - 1));
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = { start, end };
    const problem = vacationError(input, vacations, today);
    setError(problem);
    if (problem) return;
    create.mutate(input, {
      onSuccess: () => {
        setStart(today);
        setEnd(addDays(today, 6));
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Не получилось сохранить отпуск.'),
    });
  }

  return (
    <form className="vacation-form" onSubmit={submit} noValidate>
      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="vacation-start">
            С
          </label>
          <input
            id="vacation-start"
            className="input"
            type="date"
            value={start}
            onChange={(e) => {
              if (!e.target.value) return;
              // Длина отпуска сохраняется при переносе начала.
              if (end !== null) setEnd(addDays(e.target.value, diffDays(start, end)));
              setStart(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="vacation-end">
            По
          </label>
          <input
            id="vacation-end"
            className="input"
            type="date"
            value={end ?? ''}
            min={start}
            disabled={end === null}
            placeholder="пока не выключу"
            onChange={(e) => {
              if (!e.target.value) return;
              setEnd(e.target.value);
              setError(null);
            }}
          />
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Длительность отпуска">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip"
            aria-pressed={preset.days === null ? end === null : end === addDays(start, preset.days - 1)}
            onClick={() => applyPreset(preset.days)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn btn--primary btn--sm" type="submit" disabled={create.isPending}>
          <TreePalm size={15} aria-hidden /> {start > today ? 'Запланировать отпуск' : 'Начать отпуск'}
        </button>
      </div>
    </form>
  );
}

export function VacationSettings() {
  const today = useToday();
  const { data: vacations } = useVacations();
  const remove = useDeleteVacation();
  if (!vacations) return null;

  const current = currentVacation(vacations, today);
  const planned = vacations.filter((v) => v.start > today);
  const past = vacations.filter((v) => v.end !== null && v.end < today).reverse();

  return (
    <div className="stack">
      {current ? (
        <CurrentVacation vacation={current} today={today} />
      ) : (
        <>
          {planned.map((vacation) => (
            <div key={vacation.id} className="vault-status">
              <span className="vault-status__name">Запланирован отпуск: {formatVacation(vacation)}</span>
              <span className="muted small">
                {formatDays(vacationDays(vacation, today))}. Сроки повторений уже сдвинуты с учётом отпуска.
              </span>
              <div>
                <button className="btn btn--sm btn--ghost" type="button" disabled={remove.isPending} onClick={() => remove.mutate(vacation.id)}>
                  Отменить
                </button>
              </div>
            </div>
          ))}
          <VacationForm vacations={vacations} today={today} />
        </>
      )}

      {past.length > 0 && (
        <details className="details">
          <summary className="small">Прошлые отпуска: {past.length}</summary>
          <ul className="area-list vacation-list">
            {past.map((vacation) => (
              <li key={vacation.id} className="area-row">
                <span className="area-row__name">{formatVacation(vacation)}</span>
                <span className="muted small">{formatDays(vacationDays(vacation, today))}</span>
                <button
                  className="icon-btn icon-btn--danger"
                  type="button"
                  aria-label={`Удалить отпуск ${formatVacation(vacation)}`}
                  title="Удалить: эти дни снова будут считаться в расписании"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(vacation.id)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

import { addDays, diffDays, type IsoDate } from '../lib/dates';
import type { Vacation, VacationInput } from './types';

/**
 * Отпуск «останавливает время» для повторений: дни отпуска не считаются ни в интервал,
 * ни в просрочку. Заметка, которой после повторения полагалось 7 дней, вернётся через
 * 7 дней без учёта отпуска, а просроченная до отпуска — останется просроченной на столько же.
 * Поэтому после отпуска не бывает лавины: первый день после возвращения похож на день перед отъездом.
 */

/** Последний день отпуска. Отпуск «пока не выключу» идёт по сегодняшний день. */
export function vacationEnd(vacation: Pick<Vacation, 'start' | 'end'>, today: IsoDate): IsoDate {
  return vacation.end ?? (today > vacation.start ? today : vacation.start);
}

export function sortVacations<T extends Pick<Vacation, 'start'>>(vacations: T[]): T[] {
  return [...vacations].sort((a, b) => a.start.localeCompare(b.start));
}

export function isVacationDay(date: IsoDate, vacations: Vacation[], today: IsoDate): boolean {
  return vacations.some((v) => v.start <= date && date <= vacationEnd(v, today));
}

/** Отпуск, который идёт сегодня. */
export function currentVacation(vacations: Vacation[], today: IsoDate): Vacation | null {
  return vacations.find((v) => v.start <= today && today <= vacationEnd(v, today)) ?? null;
}

/** Ближайший запланированный отпуск. */
export function plannedVacation(vacations: Vacation[], today: IsoDate): Vacation | null {
  return sortVacations(vacations).find((v) => v.start > today) ?? null;
}

/**
 * Срок повторения с учётом отпусков. `anchor` — день последнего повторения (или добавления заметки),
 * `due` — срок без отпусков. Отпуск, который начался до срока, сдвигает срок на своё число дней
 * после `anchor`; отпуск после срока, но не позже сегодняшнего дня, сдвигает просроченную заметку.
 */
export function shiftForVacations(anchor: IsoDate, due: IsoDate, vacations: Vacation[], today: IsoDate): IsoDate {
  let result = due;
  for (const vacation of sortVacations(vacations)) {
    if (vacation.start > result && vacation.start > today) break;
    const end = vacationEnd(vacation, today);
    const from = vacation.start > anchor ? vacation.start : addDays(anchor, 1);
    if (end < from) continue;
    result = addDays(result, diffDays(from, end) + 1);
  }
  return result;
}

/** Как закончить отпуск сегодня: прошедшие дни остаются отпуском, а начатый сегодня или будущий — отменяется. */
export function finishVacation(vacation: Vacation, today: IsoDate): { kind: 'delete' } | { kind: 'update'; end: IsoDate } {
  if (vacation.start >= today) return { kind: 'delete' };
  return { kind: 'update', end: addDays(today, -1) };
}

/** Ошибка в датах нового отпуска или null. `existing` — уже сохранённые отпуска. */
export function vacationError(input: VacationInput, existing: Vacation[], today: IsoDate): string | null {
  if (input.end !== null && input.end < input.start) return 'Отпуск не может закончиться раньше, чем начался.';
  if (input.end === null && input.start > today) {
    return 'Отпуск без даты окончания начинается сегодня. Для будущего отпуска укажите, когда он закончится.';
  }
  const inputEnd = vacationEnd(input, today);
  if (input.end === null && existing.some((other) => other.start > inputEnd)) {
    return 'Дальше уже запланирован отпуск. Укажите дату окончания, чтобы отпуска не пересеклись.';
  }
  for (const other of existing) {
    const otherEnd = vacationEnd(other, today);
    const overlaps = input.start <= otherEnd && other.start <= inputEnd;
    // Отпуск «пока не выключу» может тянуться в будущее, поэтому после него новый начать нельзя.
    const afterOpen = other.end === null && input.start > otherEnd;
    if (overlaps || afterOpen) return 'На эти дни уже есть отпуск.';
  }
  return null;
}

/** Длина отпуска в днях; для отпуска без даты окончания — по сегодня. */
export function vacationDays(vacation: Vacation, today: IsoDate): number {
  return diffDays(vacation.start, vacationEnd(vacation, today)) + 1;
}

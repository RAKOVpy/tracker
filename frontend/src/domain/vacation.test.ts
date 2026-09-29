import { describe, expect, it } from 'vitest';
import { computeNoteState, withState } from './review';
import type { Note, Review, Vacation } from './types';
import { currentVacation, finishVacation, isVacationDay, plannedVacation, shiftForVacations, vacationError } from './vacation';

function vacation(start: string, end: string | null, id = `${start}`): Vacation {
  return { id, start, end, createdAt: 'x' };
}

const note: Note = {
  id: 'n1',
  title: 'Графы',
  materialId: null,
  questions: ['Почему?'],
  summary: '',
  obsidianUri: '',
  status: 'active',
  addedOn: '2026-10-01',
  obsidianPath: null,
  createdAt: 'x',
};

function review(date: string): Review {
  return { id: `r-${date}`, noteId: 'n1', date, rating: 'good', explain: null, taught: false, createdAt: `${date}T10:00:00Z` };
}

describe('shiftForVacations', () => {
  const trip = [vacation('2026-10-10', '2026-10-16')]; // 7 дней

  it('отпуск до срока сдвигает срок на всю длину', () => {
    expect(shiftForVacations('2026-10-05', '2026-10-12', trip, '2026-10-01')).toBe('2026-10-19');
    expect(shiftForVacations('2026-10-05', '2026-10-25', trip, '2026-10-01')).toBe('2026-11-01');
  });

  it('отпуск после срока в будущем ничего не меняет', () => {
    expect(shiftForVacations('2026-10-01', '2026-10-08', trip, '2026-10-01')).toBe('2026-10-08');
  });

  it('повторение во время отпуска: интервал отсчитывается от конца отпуска', () => {
    expect(shiftForVacations('2026-10-12', '2026-10-15', trip, '2026-10-12')).toBe('2026-10-19');
  });

  it('отпуск до последнего повторения не влияет', () => {
    expect(shiftForVacations('2026-10-20', '2026-10-27', trip, '2026-10-20')).toBe('2026-10-27');
  });

  it('заметка, просроченная до отпуска, остаётся просроченной на столько же', () => {
    // Срок 8 окт, отпуск 10–16 окт, сегодня 18 окт: без отпуска просрочено 10 дней, с отпуском — 3.
    expect(shiftForVacations('2026-10-01', '2026-10-08', trip, '2026-10-18')).toBe('2026-10-15');
  });

  it('несколько отпусков подряд складываются', () => {
    const two = [vacation('2026-10-20', '2026-10-21'), ...trip];
    // 12 → 19 после первого отпуска; второй (20–21) начинается после нового срока — не влияет.
    expect(shiftForVacations('2026-10-05', '2026-10-12', two, '2026-10-01')).toBe('2026-10-19');
    // Второй отпуск начинается в новый срок — сдвигает ещё на 3 дня.
    expect(shiftForVacations('2026-10-05', '2026-10-12', [...trip, vacation('2026-10-19', '2026-10-21')], '2026-10-01')).toBe('2026-10-22');
  });

  it('отпуск «пока не выключу» идёт по сегодня', () => {
    const open = [vacation('2026-10-10', null)];
    expect(shiftForVacations('2026-10-05', '2026-10-12', open, '2026-10-12')).toBe('2026-10-15');
    expect(shiftForVacations('2026-10-05', '2026-10-12', open, '2026-10-14')).toBe('2026-10-17');
  });
});

describe('расписание с отпуском', () => {
  it('первое повторение новой заметки переносится за отпуск', () => {
    const vacations = [vacation('2026-10-02', '2026-10-04')];
    expect(computeNoteState(note, [], { today: '2026-10-01', vacations }).dueDate).toBe('2026-10-05');
  });

  it('в отпуске повторять нечего, после — только то, что ждало до отъезда', () => {
    const vacations = [vacation('2026-10-10', '2026-10-16')];
    const reviews = [review('2026-10-02'), review('2026-10-03')]; // следующий срок — 6 окт
    const during = withState(note, reviews, '2026-10-12', vacations);
    expect(during.isDue).toBe(false);
    const after = withState(note, reviews, '2026-10-17', vacations);
    expect(after.isDue).toBe(true);
    expect(after.overdueDays).toBe(4); // 6→10 окт до отпуска
  });

  it('без отпусков расписание прежнее', () => {
    const reviews = [review('2026-10-02')];
    expect(computeNoteState(note, reviews, { today: '2026-10-02', vacations: [] })).toEqual(computeNoteState(note, reviews));
  });
});

describe('отпуска', () => {
  const vacations = [vacation('2026-10-10', '2026-10-16', 'a'), vacation('2026-11-01', null, 'b')];

  it('текущий, запланированный, день отпуска', () => {
    expect(currentVacation(vacations, '2026-10-12')?.id).toBe('a');
    expect(currentVacation(vacations, '2026-10-20')).toBeNull();
    expect(plannedVacation(vacations, '2026-10-01')?.id).toBe('a');
    expect(isVacationDay('2026-10-16', vacations, '2026-10-20')).toBe(true);
    expect(isVacationDay('2026-10-17', vacations, '2026-10-20')).toBe(false);
    expect(isVacationDay('2026-11-03', vacations, '2026-11-03')).toBe(true);
    expect(isVacationDay('2026-11-04', vacations, '2026-11-03')).toBe(false);
  });

  it('закончить отпуск: вчерашний день — последний, начатый сегодня — отменяется', () => {
    expect(finishVacation(vacation('2026-10-10', null), '2026-10-14')).toEqual({ kind: 'update', end: '2026-10-13' });
    expect(finishVacation(vacation('2026-10-14', '2026-10-20'), '2026-10-14')).toEqual({ kind: 'delete' });
    expect(finishVacation(vacation('2026-10-20', '2026-10-25'), '2026-10-14')).toEqual({ kind: 'delete' });
  });

  it('проверка дат', () => {
    const today = '2026-10-01';
    const existing = [vacation('2026-10-10', '2026-10-16')];
    expect(vacationError({ start: '2026-10-05', end: '2026-10-04' }, [], today)).toMatch(/раньше/);
    expect(vacationError({ start: '2026-10-05', end: null }, [], today)).toMatch(/без даты окончания/);
    expect(vacationError({ start: '2026-10-15', end: '2026-10-20' }, existing, today)).toMatch(/уже есть/);
    expect(vacationError({ start: '2026-10-17', end: '2026-10-20' }, existing, today)).toBeNull();
    expect(vacationError({ start: '2026-10-01', end: null }, existing, today)).toMatch(/запланирован/);
    expect(vacationError({ start: '2026-10-20', end: '2026-10-21' }, [vacation('2026-09-25', null)], today)).toMatch(/уже есть/);
    // Задним числом можно: например, отметить дни болезни.
    expect(vacationError({ start: '2026-09-25', end: '2026-09-28' }, existing, today)).toBeNull();
  });
});

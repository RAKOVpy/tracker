import { describe, expect, it } from 'vitest';
import { addDays, type IsoDate } from '../lib/dates';
import { compareHabits, computeHabitStats, habitCalendar, isLeftToday, type HabitWithStats } from './habits';
import type { HabitGoal, ProgressEntry, Vacation } from './types';

// 2026-09-28 — понедельник.
function habit(overrides: Partial<HabitGoal> = {}): HabitGoal {
  return {
    id: 'h1',
    kind: 'habit',
    title: 'Английский',
    description: '',
    areaId: null,
    unit: 'минут',
    targetValue: 20,
    startDate: '2026-09-28',
    deadline: null,
    daysPerWeek: 7,
    priority: 'medium',
    status: 'active',
    createdAt: '2026-09-28T08:00:00Z',
    ...overrides,
  };
}

const gym = (overrides: Partial<HabitGoal> = {}) => habit({ title: 'Зал', unit: 'раз', targetValue: 1, daysPerWeek: 3, ...overrides });

let seq = 0;
function entry(date: IsoDate, value = 20): ProgressEntry {
  seq += 1;
  return { id: `e${seq}`, goalId: 'h1', date, value, note: '', createdAt: `${date}T20:00:00Z` };
}

/** Записи на каждый день с from по to включительно, кроме skip. */
function every(from: IsoDate, to: IsoDate, value = 20, skip: IsoDate[] = []): ProgressEntry[] {
  const result: ProgressEntry[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (!skip.includes(day)) result.push(entry(day, value));
  return result;
}

const vacation = (start: IsoDate, end: IsoDate | null): Vacation => ({ id: `v-${start}`, start, end, createdAt: 'x' });

describe('ежедневная привычка', () => {
  it('день засчитан по норме, записи за день складываются', () => {
    const entries = [entry('2026-10-05', 10), entry('2026-10-05', 10), entry('2026-10-06', 15)];
    const monday = computeHabitStats(habit(), entries, '2026-10-05');
    expect(monday).toMatchObject({ todayValue: 20, todayDone: true, todayLeft: 0, state: 'done' });
    const tuesday = computeHabitStats(habit(), entries, '2026-10-06');
    expect(tuesday).toMatchObject({ todayValue: 15, todayDone: false, todayLeft: 5, state: 'started' });
  });

  it('серия считается со вчера, пока сегодня не отмечено', () => {
    const week = every('2026-09-28', '2026-10-04');
    expect(computeHabitStats(habit(), week, '2026-10-05').streak).toBe(7);
    expect(computeHabitStats(habit(), [...week, entry('2026-10-05')], '2026-10-05').streak).toBe(8);
  });

  it('заморозка: один пропуск в неделю серию не прерывает, но и не продлевает', () => {
    const stats = computeHabitStats(habit(), every('2026-09-28', '2026-10-04', 20, ['2026-10-01']), '2026-10-05');
    expect(stats.streak).toBe(6);
    expect(stats.forgiven).toEqual(['2026-10-01']);
  });

  it('второй пропуск в ту же неделю прерывает серию', () => {
    const entries = every('2026-09-28', '2026-10-04', 20, ['2026-10-01', '2026-10-03']);
    const stats = computeHabitStats(habit(), entries, '2026-10-05');
    expect(stats.streak).toBe(2);
    expect(stats.forgiven).toEqual(['2026-10-03']);
  });

  it('пропуски через неделю прощаются оба', () => {
    const entries = every('2026-09-28', '2026-10-11', 20, ['2026-09-29', '2026-10-06']);
    const stats = computeHabitStats(habit(), entries, '2026-10-12');
    expect(stats.streak).toBe(12);
    expect(stats.forgiven).toEqual(['2026-10-06', '2026-09-29']);
  });

  it('два пропуска подряд обнуляют серию', () => {
    const stats = computeHabitStats(habit(), every('2026-09-28', '2026-10-02'), '2026-10-05');
    expect(stats.streak).toBe(0);
    expect(stats.forgiven).toEqual([]);
  });

  it('вчерашний пропуск прощён — серия ждёт сегодняшней отметки', () => {
    const stats = computeHabitStats(habit(), every('2026-09-28', '2026-10-03'), '2026-10-05');
    expect(stats).toMatchObject({ streak: 6, forgiven: ['2026-10-04'], state: 'due' });
  });

  it('отпуск серию не прерывает и не продлевает, в отпуске привычка на паузе', () => {
    const entries = every('2026-09-28', '2026-10-01');
    const trip = [vacation('2026-10-02', '2026-10-04')];
    expect(computeHabitStats(habit(), entries, '2026-10-05', trip)).toMatchObject({ streak: 4, forgiven: [] });
    expect(computeHabitStats(habit(), entries, '2026-10-03', trip).state).toBe('paused');
    // Отмеченный в отпуске день засчитывается.
    expect(computeHabitStats(habit(), [...entries, entry('2026-10-03')], '2026-10-05', trip).streak).toBe(5);
  });

  it('норма недели — дни без отпуска и после старта', () => {
    const stats = computeHabitStats(habit({ startDate: '2026-09-30' }), [], '2026-10-01', [vacation('2026-10-03', '2026-10-03')]);
    // Ср–вс — 5 дней, минус суббота в отпуске.
    expect(stats.week).toEqual({ start: '2026-09-28', done: 0, quota: 4 });
  });

  it('выполнение за 4 недели: сегодня считается, только если отмечено; отпуск не считается', () => {
    const entries = every('2026-09-28', '2026-10-11', 20, ['2026-10-01', '2026-10-06']);
    expect(computeHabitStats(habit(), entries, '2026-10-12').rate).toEqual({ done: 12, total: 14 });
    expect(computeHabitStats(habit(), [...entries, entry('2026-10-12')], '2026-10-12').rate).toEqual({ done: 13, total: 15 });
    const trip = [vacation('2026-10-06', '2026-10-07')];
    expect(computeHabitStats(habit(), entries, '2026-10-12', trip).rate).toEqual({ done: 12, total: 13 });
    // Окно — 28 дней: старые дни не считаются.
    const long = every('2026-09-28', '2026-11-08');
    expect(computeHabitStats(habit(), long, '2026-11-09').rate).toEqual({ done: 27, total: 27 });
  });

  it('до старта — upcoming, а без истории выполнения нет', () => {
    const stats = computeHabitStats(habit({ startDate: '2026-10-10' }), [], '2026-10-05');
    expect(stats).toMatchObject({ state: 'upcoming', streak: 0, rate: null });
  });
});

describe('привычка «3 раза в неделю»', () => {
  const log = (...dates: IsoDate[]) => dates.map((date) => entry(date, 1));

  it('можно сегодня, пока есть запас дней; нужно сегодня, когда запаса нет', () => {
    const entries = log('2026-10-05', '2026-10-07');
    expect(computeHabitStats(gym(), entries, '2026-10-08')).toMatchObject({ state: 'open', week: { done: 2, quota: 3 } });
    expect(computeHabitStats(gym(), entries, '2026-10-11').state).toBe('due');
    // В пятницу с одним разом: нужно два раза за три дня — ещё можно.
    expect(computeHabitStats(gym(), log('2026-10-05'), '2026-10-09').state).toBe('open');
    expect(computeHabitStats(gym(), log('2026-10-05'), '2026-10-10').state).toBe('due');
  });

  it('норма недели выполнена — отдых, сегодняшняя отметка — сделано', () => {
    const entries = log('2026-10-05', '2026-10-06', '2026-10-07');
    expect(computeHabitStats(gym(), entries, '2026-10-08').state).toBe('rest');
    expect(computeHabitStats(gym(), [...entries, entry('2026-10-08', 1)], '2026-10-08').state).toBe('done');
  });

  it('начатая сегодня, но не доделанная — дело на сегодня, даже если сегодня можно было не делать', () => {
    const minutes = (overrides: Partial<HabitGoal> = {}) => habit({ daysPerWeek: 3, ...overrides });
    // Четверг: два раза из трёх есть — сегодня можно не делать, но начато 10 минут из 20.
    const entries = [entry('2026-10-05'), entry('2026-10-07'), entry('2026-10-08', 10)];
    const stats = computeHabitStats(minutes(), entries, '2026-10-08');
    expect(stats).toMatchObject({ state: 'started', todayLeft: 10, week: { done: 2, quota: 3 } });
    expect(isLeftToday(stats)).toBe(true);
    // Норма недели уже выполнена — начатое всё равно не «отдых».
    const full = [entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07'), entry('2026-10-08', 10)];
    expect(computeHabitStats(minutes(), full, '2026-10-08').state).toBe('started');
    // В отпуске тоже: раз начал — доделать.
    expect(computeHabitStats(minutes(), entries, '2026-10-08', [vacation('2026-10-08', '2026-10-08')]).state).toBe('started');
    // В архиве — нет.
    expect(computeHabitStats(minutes({ status: 'archived' }), entries, '2026-10-08').state).toBe('rest');
  });

  it('дело на сегодня, пока норма недели не набрана; набрана, отмечена или отпуск — нет', () => {
    const weekly = () => habit({ daysPerWeek: 3 });
    // Четверг, 2 из 3: сегодня не обязательно, но можно — в дела дня входит.
    const open = computeHabitStats(weekly(), [entry('2026-10-05'), entry('2026-10-07')], '2026-10-08');
    expect(open.state).toBe('open');
    expect(isLeftToday(open)).toBe(true);
    const rest = computeHabitStats(weekly(), [entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07')], '2026-10-08');
    expect(rest.state).toBe('rest');
    expect(isLeftToday(rest)).toBe(false);
    const done = computeHabitStats(weekly(), [entry('2026-10-05'), entry('2026-10-08')], '2026-10-08');
    expect(done.state).toBe('done');
    expect(isLeftToday(done)).toBe(false);
    const paused = computeHabitStats(weekly(), [entry('2026-10-05')], '2026-10-08', [vacation('2026-10-08', '2026-10-09')]);
    expect(paused.state).toBe('paused');
    expect(isLeftToday(paused)).toBe(false);
    expect(isLeftToday(computeHabitStats(weekly(), [], '2026-10-08'))).toBe(true);
  });

  it('два раза в один день — один засчитанный день', () => {
    expect(computeHabitStats(gym(), [entry('2026-10-05', 2)], '2026-10-06').week.done).toBe(1);
  });

  it('отпуск и старт посреди недели уменьшают норму пропорционально', () => {
    const trip = [vacation('2026-10-05', '2026-10-07')];
    expect(computeHabitStats(gym(), [], '2026-10-08', trip).week.quota).toBe(2);
    expect(computeHabitStats(gym({ startDate: '2026-10-08' }), [], '2026-10-08').week.quota).toBe(2);
    // Неделя целиком в отпуске ничего не требует и серию не прерывает.
    const entries = log('2026-09-28', '2026-09-30', '2026-10-02');
    const stats = computeHabitStats(gym(), entries, '2026-10-12', [vacation('2026-10-05', '2026-10-11')]);
    expect(stats.streak).toBe(1);
  });

  it('серия в неделях: текущая неделя считается, когда норма уже выполнена', () => {
    const entries = log('2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09');
    expect(computeHabitStats(gym(), entries, '2026-10-12').streak).toBe(2);
    const thisWeek = [...entries, ...log('2026-10-12', '2026-10-13', '2026-10-14')];
    expect(computeHabitStats(gym(), thisWeek, '2026-10-14').streak).toBe(3);
  });

  it('заморозка: неделя без одного раза прощается раз в четыре недели', () => {
    const ok = (monday: IsoDate) => log(monday, addDays(monday, 2), addDays(monday, 4));
    const short = (monday: IsoDate) => log(monday, addDays(monday, 2));
    const stats = computeHabitStats(gym(), [...ok('2026-09-28'), ...ok('2026-10-05'), ...short('2026-10-12')], '2026-10-19');
    expect(stats).toMatchObject({ streak: 2, forgiven: ['2026-10-12'] });
    // Вторая неполная неделя раньше чем через четыре недели прерывает серию.
    const twice = computeHabitStats(gym(), [...short('2026-09-28'), ...ok('2026-10-05'), ...short('2026-10-12')], '2026-10-19');
    expect(twice.streak).toBe(1);
    // Неделя без двух раз прерывает сразу.
    const bad = computeHabitStats(gym(), [...ok('2026-09-28'), ...ok('2026-10-05'), ...log('2026-10-12')], '2026-10-19');
    expect(bad.streak).toBe(0);
  });

  it('выполнение — по четырём прошедшим неделям, лишние разы не в счёт', () => {
    const entries = [
      ...log('2026-09-28', '2026-09-30', '2026-10-02'),
      ...log('2026-10-05', '2026-10-06'),
      ...log('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'),
      ...log('2026-10-19', '2026-10-21', '2026-10-23'),
      ...log('2026-10-26'),
    ];
    expect(computeHabitStats(gym(), entries, '2026-10-27').rate).toEqual({ done: 11, total: 12 });
    // Первая неделя привычки ещё идёт — выполнения пока нет.
    expect(computeHabitStats(gym(), log('2026-09-28'), '2026-09-29').rate).toBeNull();
  });
});

describe('habitCalendar', () => {
  it('отмечает сделанные, начатые, пропущенные, прощённые дни и отпуск', () => {
    const entries = [
      entry('2026-09-28'),
      entry('2026-09-29'),
      entry('2026-10-01'),
      entry('2026-10-02', 5),
      entry('2026-10-05'),
      entry('2026-10-06'),
    ];
    const trip = [vacation('2026-10-03', '2026-10-04')];
    const today = '2026-10-07';
    const item = { goal: habit(), entries, stats: computeHabitStats(habit(), entries, today, trip) };
    expect(item.stats).toMatchObject({ streak: 3, forgiven: ['2026-10-02'] });
    const weeks = habitCalendar(item, today, trip);
    expect(weeks.map((w) => [w.start, w.done, w.quota])).toEqual([
      ['2026-09-28', 3, 5],
      ['2026-10-05', 2, 7],
    ]);
    expect(weeks[0].days.map((d) => d.mark)).toEqual(['done', 'done', 'missed', 'done', 'partial', 'vacation', 'vacation']);
    expect(weeks[1].days.map((d) => d.mark)).toEqual(['done', 'done', 'today', 'future', 'future', 'future', 'future']);
  });

  it('прощённый пропуск и дни до старта', () => {
    const entries = every('2026-09-30', '2026-10-06', 20, ['2026-10-02']);
    const item = { goal: habit({ startDate: '2026-09-30' }), entries, stats: computeHabitStats(habit({ startDate: '2026-09-30' }), entries, '2026-10-07') };
    const [first] = habitCalendar(item, '2026-10-07');
    expect(first.days.map((d) => d.mark)).toEqual(['before', 'before', 'done', 'done', 'forgiven', 'done', 'done']);
  });

  it('у недельной привычки пустые дни — не пропуски, прощённая неделя помечена', () => {
    const goal = gym();
    const entries = ['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-16'].map(
      (date) => entry(date, 1),
    );
    const item = { goal, entries, stats: computeHabitStats(goal, entries, '2026-10-19') };
    expect(item.stats).toMatchObject({ streak: 2, forgiven: ['2026-10-05'] });
    const all = habitCalendar(item, '2026-10-19');
    expect(all.map((w) => [w.start, w.done, w.quota, w.forgiven])).toEqual([
      ['2026-09-28', 3, 3, false],
      ['2026-10-05', 2, 3, true],
      ['2026-10-12', 3, 3, false],
      ['2026-10-19', 0, 3, false],
    ]);
    expect(all[1].days.map((d) => d.mark)).toEqual(['done', 'empty', 'done', 'empty', 'empty', 'empty', 'empty']);
    expect(habitCalendar(item, '2026-10-19', [], 2).map((w) => w.start)).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('не показывает недели до старта и не больше заданного числа', () => {
    const item = { goal: habit(), entries: [], stats: computeHabitStats(habit(), [], '2027-01-04') };
    expect(habitCalendar(item, '2027-01-04')).toHaveLength(12);
    const fresh = { goal: habit({ startDate: '2026-10-07' }), entries: [], stats: computeHabitStats(habit({ startDate: '2026-10-07' }), [], '2026-10-07') };
    expect(habitCalendar(fresh, '2026-10-07')).toHaveLength(1);
  });
});

describe('compareHabits', () => {
  it('начатые и нужные сегодня — первыми, сделанные — в конце, затем по приоритету', () => {
    const today = '2026-10-08';
    const make = (goal: HabitGoal, entries: ProgressEntry[]): HabitWithStats => ({ goal, entries, stats: computeHabitStats(goal, entries, today) });
    const done = make(habit({ id: 'done', priority: 'high' }), [entry(today)]);
    const due = make(habit({ id: 'due', priority: 'low' }), []);
    const dueHigh = make(habit({ id: 'due-high', priority: 'high' }), []);
    const open = make(gym({ id: 'open' }), [entry('2026-10-05', 1)]);
    const started = make(habit({ id: 'started', priority: 'low' }), [entry(today, 5)]);
    const sorted = [done, open, due, started, dueHigh].sort(compareHabits).map((h) => h.goal.id);
    expect(sorted).toEqual(['started', 'due-high', 'due', 'open', 'done']);
  });
});

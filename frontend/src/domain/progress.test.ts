import { describe, expect, it } from 'vitest';
import { computeGoalStats, compareForToday, roundUpNorm, type GoalWithStats } from './progress';
import type { Goal, ProgressEntry } from './types';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Прочитать «Мастер и Маргарита»',
    description: '',
    areaId: null,
    unit: 'стр.',
    targetValue: 300,
    startDate: '2026-10-01',
    deadline: '2026-10-30', // 30 дней → 10 стр. в день
    priority: 'medium',
    status: 'active',
    createdAt: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

let seq = 0;
function entry(date: string, value: number): ProgressEntry {
  seq += 1;
  return { id: `e${seq}`, goalId: 'g1', date, value, note: '', createdAt: `${date}T20:00:00Z` };
}

describe('computeGoalStats', () => {
  it('в первый день без записей: в графике, нужно сделать дневную норму', () => {
    const s = computeGoalStats(makeGoal(), [], '2026-10-01');
    expect(s.totalDays).toBe(30);
    expect(s.dailyPlan).toBe(10);
    expect(s.daysLeft).toBe(30);
    expect(s.status).toBe('on_track');
    expect(s.todayTarget).toBe(10);
    expect(s.todayLeft).toBe(10);
  });

  it('норма на сегодня выполнена — в графике, на сегодня ничего не осталось', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-01', 4), entry('2026-10-01', 6)], '2026-10-01');
    expect(s.todayValue).toBe(10);
    expect(s.status).toBe('on_track');
    expect(s.todayLeft).toBe(0);
  });

  it('сделано больше дневной нормы — опережение', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-01', 25)], '2026-10-01');
    expect(s.status).toBe('ahead');
    expect(s.gap).toBe(15);
  });

  it('пропущенные дни — отставание и повышенная норма на сегодня', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-01', 10)], '2026-10-05');
    expect(s.status).toBe('behind');
    expect(s.gap).toBe(30); // к началу 5-го должно быть 40, сделано 10
    expect(s.daysLeft).toBe(26);
    expect(s.todayTarget).toBe(12); // (300 - 10) / 26 = 11.15 → 12
  });

  it('норма на сегодня не меняется, пока вносишь прогресс в течение дня', () => {
    const past = [entry('2026-10-01', 10)];
    const morning = computeGoalStats(makeGoal(), past, '2026-10-05');
    const evening = computeGoalStats(makeGoal(), [...past, entry('2026-10-05', 5)], '2026-10-05');
    expect(evening.todayTarget).toBe(morning.todayTarget);
    expect(evening.todayLeft).toBe(7);
  });

  it('в последний день норма не больше остатка', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-29', 295)], '2026-10-30');
    expect(s.daysLeft).toBe(1);
    expect(s.todayTarget).toBe(5);
  });

  it('цель достигнута', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-10', 200), entry('2026-10-11', 120)], '2026-10-11');
    expect(s.status).toBe('achieved');
    expect(s.percent).toBe(100);
    expect(s.remaining).toBe(0);
    expect(s.todayLeft).toBe(0);
  });

  it('дедлайн прошёл — просрочена', () => {
    const s = computeGoalStats(makeGoal(), [entry('2026-10-20', 200)], '2026-10-31');
    expect(s.status).toBe('overdue');
    expect(s.daysLeft).toBe(0);
    expect(s.gap).toBe(100);
    expect(s.todayTarget).toBe(0);
  });

  it('старт в будущем — цель запланирована', () => {
    const s = computeGoalStats(makeGoal(), [], '2026-09-25');
    expect(s.status).toBe('upcoming');
    expect(s.daysLeft).toBe(30);
    expect(s.todayTarget).toBe(0);
    expect(s.expectedByToday).toBe(0);
  });

  it('маленькие нормы округляются до десятых', () => {
    const goal = makeGoal({ targetValue: 10, unit: 'часов' });
    const s = computeGoalStats(goal, [], '2026-10-01');
    expect(s.todayTarget).toBeCloseTo(0.4);
    expect(s.dailyNorm).toBeCloseTo(0.4);
  });

  it('норма для показа совпадает с нормой первого дня', () => {
    const goal = makeGoal({ targetValue: 100, unit: 'км' }); // 3,33 км в день
    const s = computeGoalStats(goal, [], '2026-10-01');
    expect(s.dailyNorm).toBeCloseTo(3.4);
    expect(s.todayTarget).toBeCloseTo(s.dailyNorm);
    expect(roundUpNorm(384 / 30)).toBe(13);
    expect(roundUpNorm(10)).toBe(10);
  });

  it('серия считается со вчера, если сегодня ещё не отмечено', () => {
    const entries = [entry('2026-10-01', 5), entry('2026-10-03', 5), entry('2026-10-04', 5)];
    expect(computeGoalStats(makeGoal(), entries, '2026-10-05').streak).toBe(2);
    expect(computeGoalStats(makeGoal(), [...entries, entry('2026-10-05', 1)], '2026-10-05').streak).toBe(3);
    expect(computeGoalStats(makeGoal(), entries, '2026-10-06').streak).toBe(0);
  });

  it('дни отпуска не прерывают серию', () => {
    const entries = [entry('2026-10-01', 5), entry('2026-10-02', 5), entry('2026-10-06', 5)];
    const vacation = { id: 'v', start: '2026-10-03', end: '2026-10-05', createdAt: 'x' };
    expect(computeGoalStats(makeGoal(), entries, '2026-10-06').streak).toBe(1);
    expect(computeGoalStats(makeGoal(), entries, '2026-10-06', [vacation]).streak).toBe(3);
    // Отпуск идёт сейчас: сегодня ничего не отмечено, серия не сгорает.
    const open = { ...vacation, start: '2026-10-07', end: null };
    expect(computeGoalStats(makeGoal(), entries, '2026-10-09', [vacation, open]).streak).toBe(3);
  });

  it('долгосрочная — дольше 30 дней', () => {
    expect(computeGoalStats(makeGoal(), [], '2026-10-01').isLongTerm).toBe(false);
    expect(computeGoalStats(makeGoal({ deadline: '2026-12-31' }), [], '2026-10-01').isLongTerm).toBe(true);
  });
});

describe('compareForToday', () => {
  function item(goal: Partial<Goal>, entries: ProgressEntry[], today = '2026-10-05'): GoalWithStats {
    const g = makeGoal(goal);
    return { goal: g, entries, stats: computeGoalStats(g, entries, today) };
  }

  it('отстающие — первыми, затем по приоритету и дедлайну', () => {
    const onTrackHigh = item({ id: 'a', priority: 'high' }, [entry('2026-10-04', 60)]);
    const behindLow = item({ id: 'b', priority: 'low' }, []);
    const onTrackMediumSoon = item({ id: 'c', priority: 'medium', deadline: '2026-10-10' }, [entry('2026-10-04', 200)]);
    const onTrackMediumLate = item({ id: 'd', priority: 'medium' }, [entry('2026-10-04', 60)]);

    const sorted = [onTrackMediumLate, onTrackHigh, onTrackMediumSoon, behindLow].sort(compareForToday);
    expect(sorted.map((x) => x.goal.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

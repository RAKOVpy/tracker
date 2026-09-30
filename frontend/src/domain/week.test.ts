import { describe, expect, it } from 'vitest';
import { computeHabitStats } from './habits';
import { computeGoalStats } from './progress';
import { taskInput } from './tasks';
import type { HabitGoal, ProgressEntry, Project, Review, TargetGoal, Task, WeeklyReview } from './types';
import { currentFocus, focusSuggestions, reviewReminder, reviewWeekFor, weekResults } from './week';

// 2026-09-28 — понедельник, 2026-10-02 — пятница.
const review = (weekStart: string, focus: WeeklyReview['focus'] = []): WeeklyReview => ({
  id: `w-${weekStart}`,
  weekStart,
  focus,
  reflection: '',
  createdAt: 'x',
});

let seq = 0;
function task(fields: Partial<Task> & Pick<Task, 'title'>): Task {
  seq += 1;
  return { ...taskInput(fields), id: `t${seq}`, repeatOf: null, completedAt: fields.completedAt ?? null, createdAt: `2026-09-2${seq % 10}T08:00:00Z` };
}

const habit: HabitGoal = {
  id: 'h1',
  kind: 'habit',
  title: 'Зал',
  description: '',
  areaId: null,
  unit: 'раз',
  targetValue: 1,
  startDate: '2026-09-21',
  deadline: null,
  daysPerWeek: 3,
  priority: 'medium',
  status: 'active',
  createdAt: 'x',
};
const entry = (date: string): ProgressEntry => ({ id: `e-${date}`, goalId: 'h1', date, value: 1, note: '', createdAt: 'x' });

describe('какую неделю подводить', () => {
  it('с пятницы по воскресенье — текущую, с понедельника по четверг — прошлую', () => {
    expect(reviewWeekFor('2026-10-02')).toBe('2026-09-28');
    expect(reviewWeekFor('2026-10-04')).toBe('2026-09-28');
    expect(reviewWeekFor('2026-10-05')).toBe('2026-09-28');
    expect(reviewWeekFor('2026-10-08')).toBe('2026-09-28');
    expect(reviewWeekFor('2026-10-09')).toBe('2026-10-05');
  });

  it('фокус текущей недели выбран в обзоре прошлой', () => {
    const reviews = [review('2026-09-21'), review('2026-09-28')];
    expect(currentFocus(reviews, '2026-10-05')?.weekStart).toBe('2026-09-28');
    expect(currentFocus(reviews, '2026-10-11')?.weekStart).toBe('2026-09-28');
    expect(currentFocus(reviews, '2026-10-04')?.weekStart).toBe('2026-09-21');
    expect(currentFocus(reviews, '2026-10-12')).toBeNull();
  });

  it('напоминание — с пятницы по понедельник, пока неделю не подвели', () => {
    expect(reviewReminder([], '2026-10-02')).toBe('2026-09-28');
    expect(reviewReminder([], '2026-10-05')).toBe('2026-09-28');
    expect(reviewReminder([review('2026-09-28')], '2026-10-04')).toBeNull();
    expect(reviewReminder([], '2026-10-06')).toBeNull();
    expect(reviewReminder([], '2026-10-08')).toBeNull();
  });
});

describe('итоги недели', () => {
  it('сделанные задачи, повторения, привычки и прошлый фокус', () => {
    const tasks = [
      task({ title: 'В неделе', status: 'done', completedAt: '2026-09-30T12:00:00Z' }),
      task({ title: 'Раньше', status: 'done', completedAt: '2026-09-25T12:00:00Z' }),
      task({ title: 'Отменена', status: 'cancelled', completedAt: '2026-09-30T12:00:00Z' }),
      task({ title: 'Открыта' }),
    ];
    const reviews: Review[] = ['2026-09-28', '2026-10-01', '2026-10-05'].map((date, i) => ({
      id: `r${i}`,
      noteId: 'n',
      date,
      rating: 'good',
      explain: null,
      taught: false,
      createdAt: 'x',
    }));
    const entries = [entry('2026-09-28'), entry('2026-10-01')];
    const habits = [{ goal: habit, entries, stats: computeHabitStats(habit, entries, '2026-10-05') }];
    const focus = [{ id: 'f1', text: 'Доклад', done: true }];
    const results = weekResults({
      weekStart: '2026-09-28',
      today: '2026-10-05',
      tasks,
      reviews,
      habits,
      weeklyReviews: [review('2026-09-21', focus)],
      vacations: [],
    });
    expect(results).toEqual({ tasksDone: 1, reviews: 2, habits: { done: 2, total: 3 }, focus });
  });

  it('у идущей недели норма привычек — по сегодня', () => {
    const habits = [{ goal: habit, entries: [entry('2026-09-28')], stats: computeHabitStats(habit, [entry('2026-09-28')], '2026-10-02') }];
    const results = weekResults({ weekStart: '2026-09-28', today: '2026-10-02', tasks: [], reviews: [], habits, weeklyReviews: [], vacations: [] });
    // Пн–пт — 5 дней из 7: нужно round(3 × 5 / 7) = 2.
    expect(results.habits).toEqual({ done: 1, total: 2 });
    expect(results.focus).toBeNull();
  });
});

describe('подсказки для фокуса', () => {
  const target = (overrides: Partial<TargetGoal>): TargetGoal => ({
    id: 'g1',
    kind: 'target',
    title: 'Прочитать книгу',
    description: '',
    areaId: null,
    unit: 'стр.',
    targetValue: 300,
    startDate: '2026-09-01',
    deadline: '2026-10-30',
    daysPerWeek: null,
    priority: 'medium',
    status: 'active',
    createdAt: 'x',
    ...overrides,
  });
  const project = (overrides: Partial<Project>): Project => ({
    id: 'p1',
    title: 'Переезд',
    description: '',
    areaId: null,
    goalId: null,
    status: 'active',
    deadline: null,
    milestones: [],
    completedAt: null,
    createdAt: 'x',
    ...overrides,
  });

  it('несделанный фокус, важные задачи, отстающие цели, проекты без шага и привычки — без повторов', () => {
    const today = '2026-10-03';
    const behind = target({ id: 'g1' });
    const onTrack = target({ id: 'g2', title: 'Спокойная цель', startDate: '2026-10-03' });
    const goals = [behind, onTrack].map((goal) => ({ goal, entries: [], stats: computeGoalStats(goal, [], today) }));
    const tasks = [
      task({ title: 'Сдать эссе', important: true, deadline: '2026-10-08' }),
      task({ title: 'Далёкий дедлайн', important: true, deadline: '2026-11-20' }),
      task({ title: 'Неважная', deadline: '2026-10-06' }),
      task({ title: 'Доклад', important: true, plannedDate: '2026-10-05' }),
      task({ title: 'Задача проекта', projectId: 'p2' }),
    ];
    const projects = [project({ id: 'p1' }), project({ id: 'p2', title: 'IELTS' })];
    const habits = [{ goal: habit, entries: [entry('2026-09-28')], stats: computeHabitStats(habit, [entry('2026-09-28')], today) }];
    const suggestions = focusSuggestions({
      weekStart: '2026-09-28',
      today,
      focus: [
        { id: 'f1', text: 'доклад', done: false },
        { id: 'f2', text: 'Выспаться', done: true },
      ],
      tasks,
      projects,
      goals,
      habits,
      vacations: [],
    });
    expect(suggestions).toEqual([
      { text: 'доклад', why: 'не сделано из фокуса этой недели' },
      { text: 'Сдать эссе', why: 'важно, срок 8 окт' },
      { text: 'Прочитать книгу', why: 'цель отстаёт от плана' },
      { text: 'Переезд', why: 'у проекта нет следующего шага' },
      { text: 'Зал', why: 'привычка: 1 из 3 за неделю' },
    ]);
  });
});

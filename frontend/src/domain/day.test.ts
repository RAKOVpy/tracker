import { describe, expect, it } from 'vitest';
import { summarizeDay } from './day';

const none = { tasksLeft: 0, tasksDone: 0, habitsLeft: 0, habitsDone: 0, goalsLeft: 0, goalsDone: 0, reviewsLeft: 0, reviewedToday: 0 };

describe('summarizeDay', () => {
  it('нечего делать — пустой итог', () => {
    expect(summarizeDay(none)).toMatchObject({ done: 0, total: 0 });
  });

  it('повторение — одно дело, сколько бы ни было заметок', () => {
    const day = summarizeDay({ ...none, tasksLeft: 2, tasksDone: 1, goalsLeft: 1, goalsDone: 1, reviewsLeft: 12 });
    expect(day).toEqual({
      done: 2,
      total: 6,
      title: 'Осталось 4 дела на сегодня',
      hint: '2 задачи, норма по 1 цели и повторение.',
    });
  });

  it('повторение сделано, если очередь пуста и сегодня повторяли', () => {
    expect(summarizeDay({ ...none, goalsLeft: 5, reviewedToday: 3 })).toMatchObject({
      done: 1,
      total: 6,
      title: 'Осталось 5 дел на сегодня',
      hint: 'Норма по 5 целям.',
    });
  });

  it('привычки — после задач, каждая отдельным делом', () => {
    expect(summarizeDay({ ...none, tasksLeft: 1, habitsLeft: 2, habitsDone: 1, goalsLeft: 1 })).toMatchObject({
      done: 1,
      total: 5,
      hint: '1 задача, 2 привычки и норма по 1 цели.',
    });
    expect(summarizeDay({ ...none, habitsLeft: 5 }).hint).toBe('5 привычек.');
  });

  it('всё сделано', () => {
    expect(summarizeDay({ ...none, tasksDone: 3, goalsDone: 1 })).toMatchObject({ done: 4, total: 4, title: 'На сегодня всё сделано' });
  });
});

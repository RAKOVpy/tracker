import { describe, expect, it } from 'vitest';
import { addDays } from '../lib/dates';
import {
  anchorRecurrence,
  describeRecurrence,
  firstOccurrence,
  isOccurrence,
  nextInstance,
  nextOccurrence,
  normalizeRecurrence,
  occurrenceOnOrBefore,
  previousRepeats,
} from './recurrence';
import { applyTaskUpdate, taskInput } from './tasks';
import type { Recurrence, Task } from './types';

const MON = '2026-10-05';
const WED = '2026-10-07';
const SUN = '2026-10-11';

const rule = (fields: Partial<Recurrence>): Recurrence => ({ unit: 'day', interval: 1, weekdays: [], start: MON, ...fields });

function task(fields: Partial<Task> = {}): Task {
  return { ...taskInput({ title: 'Разбор недели' }), id: 't1', repeatOf: null, completedAt: null, createdAt: 'x', ...fields };
}

describe('nextOccurrence', () => {
  it.each([
    ['каждый день', rule({}), WED, '2026-10-08'],
    ['каждые 3 дня — в фазе от старта', rule({ interval: 3 }), WED, '2026-10-08'],
    ['до старта — сам старт', rule({ interval: 3 }), '2026-09-01', MON],
    ['каждое вс', rule({ unit: 'week', weekdays: [6] }), WED, SUN],
    ['каждое вс, после вс — следующее', rule({ unit: 'week', weekdays: [6] }), SUN, '2026-10-18'],
    ['по пн и чт', rule({ unit: 'week', weekdays: [0, 3] }), WED, '2026-10-08'],
    ['каждые 2 недели по пн: неделя через одну', rule({ unit: 'week', interval: 2, weekdays: [0] }), MON, '2026-10-19'],
    ['каждый месяц 31-го в коротком месяце — последний день', rule({ unit: 'month', start: '2026-01-31' }), '2026-02-01', '2026-02-28'],
    ['и снова 31-го, без сдвига к 28-му', rule({ unit: 'month', start: '2026-01-31' }), '2026-02-28', '2026-03-31'],
    ['каждые 3 месяца', rule({ unit: 'month', interval: 3, start: '2026-01-15' }), '2026-04-15', '2026-07-15'],
    ['каждый год 29 фев — в обычный год 28-го', rule({ unit: 'year', start: '2024-02-29' }), '2024-03-01', '2025-02-28'],
  ])('%s', (_name, r, after, expected) => {
    expect(nextOccurrence(r, after)).toBe(expected);
  });
});

describe('расписание сходится с перебором', () => {
  // Простой генератор: воспроизводимые случайные правила без зависимостей.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];

  it('nextOccurrence и occurrenceOnOrBefore — ближайшие даты, для которых isOccurrence', () => {
    for (let i = 0; i < 400; i++) {
      const unit = pick(['day', 'week', 'month', 'year'] as const);
      const r = normalizeRecurrence({
        unit,
        interval: 1 + Math.floor(random() * 4),
        weekdays: [0, 1, 2, 3, 4, 5, 6].filter(() => random() < 0.3),
        start: addDays('2024-01-01', Math.floor(random() * 900)),
      });
      const date = addDays(r.start, Math.floor(random() * 500) - 60);

      let expectedNext = addDays(date, 1);
      while (!isOccurrence(r, expectedNext)) expectedNext = addDays(expectedNext, 1);
      expect(nextOccurrence(r, date), JSON.stringify({ r, date })).toBe(expectedNext);

      let expectedPrev: string | null = date;
      while (expectedPrev !== null && !isOccurrence(r, expectedPrev)) {
        expectedPrev = expectedPrev > r.start ? addDays(expectedPrev, -1) : null;
      }
      expect(occurrenceOnOrBefore(r, date), JSON.stringify({ r, date })).toBe(expectedPrev);
    }
  });
});

describe('firstOccurrence', () => {
  it('в тот же день, если он подходит', () => {
    expect(firstOccurrence(rule({ unit: 'week', weekdays: [2] }), WED)).toBe(WED);
    expect(firstOccurrence(rule({ unit: 'week', weekdays: [6] }), WED)).toBe(SUN);
  });
});

describe('anchorRecurrence', () => {
  const sundays = rule({ unit: 'week', weekdays: [6], start: '2020-01-01' });

  it('отсчёт от даты задачи, лишние поля задачи не мешают', () => {
    const t = task({ deadline: '2026-10-10', recurrence: null });
    expect(anchorRecurrence(rule({ unit: 'month' }), t, WED)).toEqual({
      recurrence: { unit: 'month', interval: 1, weekdays: [], start: '2026-10-10' },
      plannedDate: null,
      deadline: '2026-10-10',
    });
  });

  it('задача без дат встаёт на первый повтор', () => {
    expect(anchorRecurrence(sundays, { plannedDate: null, deadline: null }, WED)).toEqual({
      recurrence: { ...sundays, start: SUN },
      plannedDate: SUN,
      deadline: null,
    });
  });
});

describe('normalizeRecurrence', () => {
  it('дни недели по порядку и без повторов, у недельного без дней — день старта', () => {
    expect(normalizeRecurrence(rule({ unit: 'week', weekdays: [4, 0, 4] })).weekdays).toEqual([0, 4]);
    expect(normalizeRecurrence(rule({ unit: 'week', weekdays: [], start: SUN })).weekdays).toEqual([6]);
    expect(normalizeRecurrence(rule({ unit: 'month', weekdays: [1] })).weekdays).toEqual([]);
    expect(normalizeRecurrence(rule({ interval: 0 })).interval).toBe(1);
    expect(normalizeRecurrence(rule({ interval: 500 })).interval).toBe(99);
  });
});

describe('describeRecurrence', () => {
  it.each([
    [rule({}), 'каждый день'],
    [rule({ interval: 2 }), 'каждые 2 дня'],
    [rule({ interval: 5 }), 'каждые 5 дней'],
    [rule({ interval: 21 }), 'каждый 21 день'],
    [rule({ unit: 'week', weekdays: [6] }), 'каждое воскресенье'],
    [rule({ unit: 'week', weekdays: [2] }), 'каждую среду'],
    [rule({ unit: 'week', weekdays: [0, 3] }), 'по пн и чт'],
    [rule({ unit: 'week', weekdays: [0, 2, 4] }), 'по пн, ср и пт'],
    [rule({ unit: 'week', weekdays: [0, 1, 2, 3, 4] }), 'по будням'],
    [rule({ unit: 'week', weekdays: [5, 6] }), 'по выходным'],
    [rule({ unit: 'week', weekdays: [0, 1, 2, 3, 4, 5, 6] }), 'каждый день'],
    [rule({ unit: 'week', interval: 2, weekdays: [4] }), 'каждые 2 недели по пт'],
    [rule({ unit: 'month', start: '2026-10-10' }), 'каждый месяц, 10-го'],
    [rule({ unit: 'month', interval: 3, start: '2026-10-10' }), 'каждые 3 месяца, 10-го'],
    [rule({ unit: 'year', start: '2026-03-05' }), 'каждый год, 5 марта'],
    [rule({ unit: 'year', interval: 5, start: '2026-03-05' }), 'каждые 5 лет, 5 марта'],
  ])('%j → %s', (r, text) => {
    expect(describeRecurrence(r)).toBe(text);
  });
});

describe('nextInstance', () => {
  const ctx = { id: 't2', now: 'now' };
  const sundays = rule({ unit: 'week', weekdays: [6], start: SUN });

  it('следующий повтор — открытая задача со следующей датой и неотмеченными подзадачами', () => {
    const done = task({
      status: 'done',
      plannedDate: SUN,
      recurrence: sundays,
      checklist: [{ id: 'c', text: 'Входящие', done: true }],
      completedAt: 'then',
    });
    expect(nextInstance(done, SUN, ctx)).toMatchObject({
      id: 't2',
      status: 'todo',
      plannedDate: '2026-10-18',
      checklist: [{ id: 'c', text: 'Входящие', done: false }],
      repeatOf: 't1',
      completedAt: null,
      createdAt: 'now',
      recurrence: sundays,
    });
  });

  it('сделали раньше — следующий повтор после даты задачи, а не завтра', () => {
    expect(nextInstance(task({ plannedDate: SUN, recurrence: sundays }), WED, ctx).plannedDate).toBe('2026-10-18');
  });

  it('опоздали — следующий повтор после сегодня, без цепочки просроченных', () => {
    const daily = task({ plannedDate: '2026-10-01', recurrence: rule({ start: '2026-10-01' }) });
    expect(nextInstance(daily, WED, ctx).plannedDate).toBe('2026-10-08');
  });

  it('перенесённый разово повтор возвращается к расписанию, дедлайн сдвигается на шаг расписания', () => {
    // Повтор воскресенья перенесли на вт; срок «до пн» был на день позже воскресенья.
    const moved = task({ plannedDate: '2026-10-13', deadline: '2026-10-12', recurrence: sundays });
    expect(nextInstance(moved, '2026-10-13', ctx)).toMatchObject({ plannedDate: '2026-10-18', deadline: '2026-10-19' });
  });

  it('без плана повтор ведёт дедлайн', () => {
    const rent = task({ deadline: '2026-10-10', recurrence: rule({ unit: 'month', start: '2026-10-10' }) });
    expect(nextInstance(rent, WED, ctx)).toMatchObject({ plannedDate: null, deadline: '2026-11-10' });
  });
});

describe('applyTaskUpdate', () => {
  let n = 0;
  const ctx = (today = SUN) => ({ now: '2026-10-11T18:00:00.000Z', today, newId: () => `new-${++n}` });
  const weekly = task({ plannedDate: SUN, recurrence: rule({ unit: 'week', weekdays: [6], start: SUN }) });

  it('сделали повторяющуюся задачу — появляется следующая, сделанная остаётся', () => {
    const result = applyTaskUpdate([weekly], 't1', { status: 'done' }, ctx());
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 't1', status: 'done', completedAt: '2026-10-11T18:00:00.000Z' });
    expect(result[1]).toMatchObject({ status: 'todo', plannedDate: '2026-10-18', repeatOf: 't1' });
  });

  it('пропустили раз — тоже появляется следующая', () => {
    expect(applyTaskUpdate([weekly], 't1', { status: 'cancelled' }, ctx())).toHaveLength(2);
  });

  it('разовая задача и правка без закрытия повтор не создают', () => {
    expect(applyTaskUpdate([task()], 't1', { status: 'done' }, ctx())).toHaveLength(1);
    expect(applyTaskUpdate([weekly], 't1', { title: 'Обзор' }, ctx())).toHaveLength(1);
  });

  it('сняли отметку — нетронутый следующий повтор убирается, серия продолжается этой задачей', () => {
    const closed = applyTaskUpdate([weekly], 't1', { status: 'done' }, ctx());
    const reopened = applyTaskUpdate(closed, 't1', { status: 'todo' }, ctx());
    expect(reopened).toEqual([{ ...weekly, completedAt: null }]);
    // И снова сделали — снова один следующий повтор.
    expect(applyTaskUpdate(reopened, 't1', { status: 'done' }, ctx())).toHaveLength(2);
  });

  it('следующий повтор уже трогали — он остаётся, а эта задача становится разовой', () => {
    const [closed, next] = applyTaskUpdate([weekly], 't1', { status: 'done' }, ctx());
    const edited = { ...next, checklist: [{ id: 'c', text: 'Шаг', done: true }] };
    const reopened = applyTaskUpdate([closed, edited], 't1', { status: 'todo' }, ctx());
    expect(reopened).toHaveLength(2);
    expect(reopened[0]).toMatchObject({ status: 'todo', recurrence: null });
    expect(reopened[1]).toBe(edited);
  });

  it('повтор сделан уже дважды — старая задача при возврате становится разовой', () => {
    const [first, second] = applyTaskUpdate([weekly], 't1', { status: 'done' }, ctx());
    const chain = applyTaskUpdate([first, second], second.id, { status: 'done' }, ctx('2026-10-18'));
    expect(chain).toHaveLength(3);
    const reopened = applyTaskUpdate(chain, 't1', { status: 'todo' }, ctx());
    expect(reopened).toHaveLength(3);
    expect(reopened[0].recurrence).toBeNull();
    expect(previousRepeats(chain[2], chain, 5).map((t) => t.id)).toEqual([second.id, 't1']);
  });
});

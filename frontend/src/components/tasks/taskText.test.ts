import { describe, expect, it } from 'vitest';
import { deadlineTag, planTag } from './taskText';

const TODAY = '2026-10-07'; // среда

describe('deadlineTag', () => {
  it.each([
    ['2026-10-02', 'срок прошёл 2 окт', 'bad'],
    ['2026-10-07', 'срок сегодня', 'warn'],
    ['2026-10-08', 'срок завтра', 'warn'],
    ['2026-10-09', 'до пт', 'warn'],
    ['2026-10-12', 'до пн', undefined],
    ['2026-10-16', 'до 16 окт', undefined],
  ])('%s → %s', (deadline, text, tone) => {
    expect(deadlineTag(deadline, TODAY)).toEqual(tone ? { text, tone } : { text });
  });

  it.each([
    ['2026-10-02', 'milestone', 'срок вехи прошёл 2 окт'],
    ['2026-10-07', 'milestone', 'срок вехи сегодня'],
    ['2026-10-08', 'project', 'срок проекта завтра'],
    ['2026-10-09', 'milestone', 'веха до пт'],
    ['2026-10-16', 'project', 'проект до 16 окт'],
  ] as const)('срок чужой: %s, %s → %s', (deadline, from, text) => {
    expect(deadlineTag(deadline, TODAY, from).text).toBe(text);
  });
});

describe('planTag', () => {
  it.each([
    ['2026-10-07', null],
    ['2026-10-05', 'перенесено с пн'],
    ['2026-09-28', 'перенесено с 28 сент'],
    ['2026-10-08', 'завтра'],
    ['2026-10-09', 'пт, 9 окт'],
    ['2026-10-20', '20 окт'],
  ])('%s → %s', (planned, text) => {
    expect(planTag(planned, TODAY)).toBe(text);
  });
});

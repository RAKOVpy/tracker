import { describe, expect, it } from 'vitest';
import { parseTask, type ParseContext } from './parseTask';

const TODAY = '2026-10-07'; // среда

const ctx: ParseContext = {
  today: TODAY,
  areas: [
    { id: 'study', name: 'Учёба' },
    { id: 'sport', name: 'Спорт' },
    { id: 'lang', name: 'Английский язык' },
  ],
  projects: [
    { id: 'ielts', title: 'Подготовиться к IELTS' },
    { id: 'move', title: 'Переезд' },
  ],
};

const parse = (text: string, extra: Partial<ParseContext> = {}) => parseTask(text, { ...ctx, ...extra });

describe('parseTask', () => {
  it('пример из описания: дедлайн, важность и сфера', () => {
    expect(parse('законспектировать лекцию 5 до пт !важно #учёба')).toMatchObject({
      title: 'законспектировать лекцию 5',
      deadline: '2026-10-09',
      plannedDate: null,
      important: true,
      areaId: 'study',
      tokens: [
        { kind: 'deadline', text: 'до пт' },
        { kind: 'important', text: '!важно' },
        { kind: 'area', text: '#учёба' },
      ],
    });
  });

  it('обычный текст не трогает', () => {
    expect(parse('позвонить в банк про карту')).toMatchObject({ title: 'позвонить в банк про карту', tokens: [] });
    expect(parse('прочитать 20 страниц')).toMatchObject({ title: 'прочитать 20 страниц', plannedDate: null });
    expect(parse('в среднем 5 км')).toMatchObject({ title: 'в среднем 5 км', plannedDate: null });
    expect(parse('настроить рабочую среду')).toMatchObject({ title: 'настроить рабочую среду', plannedDate: null });
    expect(parse('созвон в 15:00')).toMatchObject({ title: 'созвон в 15:00', plannedDate: null });
    expect(parse('ещё раз в пятницу')).toMatchObject({ title: 'ещё раз', plannedDate: '2026-10-09', recurrence: null });
  });

  it.each([
    ['сегодня', TODAY],
    ['завтра', '2026-10-08'],
    ['послезавтра', '2026-10-09'],
    ['на завтра', '2026-10-08'],
    ['в пт', '2026-10-09'],
    ['во вторник', '2026-10-13'],
    ['в среду', TODAY],
    ['на 15 окт', '2026-10-15'],
    ['15 октября', '2026-10-15'],
    ['15.10', '2026-10-15'],
    ['1 окт', '2027-10-01'],
    ['5.01', '2027-01-05'],
    ['12.12.2026', '2026-12-12'],
    ['через 3 дня', '2026-10-10'],
    ['через неделю', '2026-10-14'],
    ['через две недели', '2026-10-21'],
    ['через месяц', '2026-11-07'],
    ['на выходных', '2026-10-10'],
  ])('когда делаю: «%s»', (phrase, date) => {
    const parsed = parse(`отчёт ${phrase}`);
    expect(parsed.plannedDate).toBe(date);
    expect(parsed.title).toBe('отчёт');
    expect(parsed.tokens).toEqual([{ kind: 'plan', text: phrase }]);
  });

  it.each([
    ['до пт', '2026-10-09'],
    ['до пятницы', '2026-10-09'],
    ['к пятнице', '2026-10-09'],
    ['до завтра', '2026-10-08'],
    ['до 15 окт', '2026-10-15'],
    ['до 15.10', '2026-10-15'],
    ['до конца недели', '2026-10-11'],
    ['до конца месяца', '2026-10-31'],
  ])('дедлайн: «%s»', (phrase, date) => {
    const parsed = parse(`отчёт ${phrase}`);
    expect(parsed.deadline).toBe(date);
    expect(parsed.title).toBe('отчёт');
  });

  it('несуществующие даты остаются текстом', () => {
    expect(parse('до 31.02')).toMatchObject({ title: 'до 31.02', deadline: null });
    expect(parse('версия 1.13')).toMatchObject({ title: 'версия 1.13', plannedDate: null });
  });

  it('29 февраля — в ближайший високосный год', () => {
    expect(parse('день 29 фев').plannedDate).toBe('2028-02-29');
  });

  it('голая дата после другого предлога — не план', () => {
    expect(parse('отпуск с 5 окт')).toMatchObject({ title: 'отпуск с 5 окт', plannedDate: null });
    expect(parse('после 15.10 созвониться')).toMatchObject({ plannedDate: null });
  });

  it('план и дедлайн вместе; второй план остаётся текстом', () => {
    expect(parse('эссе завтра до пт')).toMatchObject({ title: 'эссе', plannedDate: '2026-10-08', deadline: '2026-10-09' });
    expect(parse('перенести с 5 окт на 7 окт')).toMatchObject({ title: 'перенести с 5 окт', plannedDate: TODAY });
    expect(parse('завтра или в пт')).toMatchObject({ title: 'или в пт', plannedDate: '2026-10-08' });
  });

  describe('повтор', () => {
    it.each([
      ['каждый день', { unit: 'day', interval: 1, weekdays: [] }, TODAY],
      ['ежедневно', { unit: 'day', interval: 1, weekdays: [] }, TODAY],
      ['каждые 3 дня', { unit: 'day', interval: 3, weekdays: [] }, TODAY],
      ['каждое вс', { unit: 'week', interval: 1, weekdays: [6] }, '2026-10-11'],
      ['каждое воскресенье', { unit: 'week', interval: 1, weekdays: [6] }, '2026-10-11'],
      ['каждую неделю', { unit: 'week', interval: 1, weekdays: [2] }, TODAY],
      ['каждые 2 недели по пт', { unit: 'week', interval: 2, weekdays: [4] }, '2026-10-09'],
      ['по пн и чт', { unit: 'week', interval: 1, weekdays: [0, 3] }, '2026-10-08'],
      ['по пн, ср, пт', { unit: 'week', interval: 1, weekdays: [0, 2, 4] }, TODAY],
      ['по средам и пятницам', { unit: 'week', interval: 1, weekdays: [2, 4] }, TODAY],
      ['по будням', { unit: 'week', interval: 1, weekdays: [0, 1, 2, 3, 4] }, TODAY],
      ['по выходным', { unit: 'week', interval: 1, weekdays: [5, 6] }, '2026-10-10'],
      ['раз в неделю', { unit: 'week', interval: 1, weekdays: [2] }, TODAY],
      ['раз в 2 месяца', { unit: 'month', interval: 2, weekdays: [] }, TODAY],
      ['ежемесячно', { unit: 'month', interval: 1, weekdays: [] }, TODAY],
      ['каждый год', { unit: 'year', interval: 1, weekdays: [] }, TODAY],
    ])('«%s»', (phrase, rule, first) => {
      const parsed = parse(`разбор ${phrase}`);
      expect(parsed.title).toBe('разбор');
      expect(parsed.recurrence).toEqual({ ...rule, start: first });
      expect(parsed.plannedDate).toBe(first);
      expect(parsed.tokens).toEqual([{ kind: 'repeat', text: phrase }]);
    });

    it('с датой: отсчёт от неё', () => {
      expect(parse('аренда каждый месяц до 10 окт')).toMatchObject({
        title: 'аренда',
        deadline: '2026-10-10',
        plannedDate: null,
        recurrence: { unit: 'month', start: '2026-10-10' },
      });
      expect(parse('разбор недели каждое вс завтра')).toMatchObject({
        plannedDate: '2026-10-08',
        recurrence: { unit: 'week', weekdays: [6], start: '2026-10-08' },
      });
    });
  });

  describe('#сфера и #проект', () => {
    it('по началу названия, без учёта регистра и ё', () => {
      expect(parse('пробежка #спорт').areaId).toBe('sport');
      expect(parse('конспект #учеба').areaId).toBe('study');
      expect(parse('слова #англ').areaId).toBe('lang');
      expect(parse('слова #английский_язык').areaId).toBe('lang');
    });

    it('проект — по любому слову названия; сфера и проект вместе', () => {
      expect(parse('эссе #ielts #англ')).toMatchObject({ title: 'эссе', projectId: 'ielts', areaId: 'lang' });
      expect(parse('коробки #переезд').projectId).toBe('move');
    });

    it('неизвестный или неоднозначный тег остаётся текстом', () => {
      expect(parse('идея #потом')).toMatchObject({ title: 'идея #потом', areaId: null, projectId: null });
      expect(parse('задача #с')).toMatchObject({ title: 'задача #с' });
      expect(parse('коробки #переезд', { projects: [] })).toMatchObject({ title: 'коробки #переезд', projectId: null });
    });
  });

  it('важность: «!важно» и «!!», но не восклицательный знак в тексте', () => {
    expect(parse('!! налог').important).toBe(true);
    expect(parse('налог !важно!').important).toBe(true);
    expect(parse('позвонить маме!')).toMatchObject({ title: 'позвонить маме!', important: false });
  });

  it('отменённый фрагмент остаётся в названии целиком', () => {
    const ignore = new Set(['до пт']);
    expect(parse('отчёт до пт', { ignore })).toMatchObject({ title: 'отчёт до пт', deadline: null, tokens: [] });
    const repeat = new Set(['каждые 2 недели по пт']);
    expect(parse('уборка каждые 2 недели по пт', { ignore: repeat })).toMatchObject({
      title: 'уборка каждые 2 недели по пт',
      recurrence: null,
    });
    expect(parse('билеты на 15 окт', { ignore: new Set(['на 15 окт']) })).toMatchObject({ plannedDate: null });
  });

  it('знаки препинания вокруг распознанного не остаются в названии', () => {
    expect(parse('позвонить маме, завтра').title).toBe('позвонить маме');
    expect(parse('налоги — до пт.').title).toBe('налоги');
  });
});

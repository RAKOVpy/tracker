import { addDays, addMonths, weekdayIndex, type IsoDate } from '../lib/dates';
import { anchorRecurrence } from './recurrence';
import type { Area, Project, Recurrence, RepeatUnit } from './types';

/**
 * Разбор быстрой записи: «законспектировать лекцию 5 до пт !важно #учёба» → задача
 * «законспектировать лекцию 5» с дедлайном в пятницу, важная, в сфере «Учёба».
 *
 * Понимает:
 * - когда делаю: «сегодня», «завтра», «послезавтра», «в пт», «на 15 окт», «15.10», «через 3 дня», «на выходных»;
 * - дедлайн: «до пт», «к пятнице», «до 15 окт», «до конца недели», «до конца месяца»;
 * - повтор: «каждый день», «каждое вс», «каждые 2 недели», «по будням», «по пн и чт», «раз в месяц», «ежедневно»;
 * - важность: «!важно» или «!!»;
 * - сферу или проект: «#учёба», «#ielts» — по началу названия.
 *
 * День недели без предлога («пятница») не распознаётся: «рабочая среда» — не дата. Голая дата после
 * другого предлога («с 5 окт», «после 15.10») тоже остаётся текстом. Каждый распознанный фрагмент
 * виден под полем, и его можно отменить (`ignore`) — тогда он останется в названии как есть.
 */

export type TokenKind = 'plan' | 'deadline' | 'repeat' | 'important' | 'area' | 'project';

export interface ParsedToken {
  kind: TokenKind;
  /** Фрагмент исходного текста: «до пт», «#учёба». */
  text: string;
}

export interface ParsedTask {
  title: string;
  important: boolean;
  plannedDate: IsoDate | null;
  deadline: IsoDate | null;
  recurrence: Recurrence | null;
  areaId: string | null;
  projectId: string | null;
  tokens: ParsedToken[];
}

export interface ParseContext {
  today: IsoDate;
  areas: Pick<Area, 'id' | 'name'>[];
  /** Проекты, в которые можно положить задачу через #; пусто — # ищет только сферы. */
  projects: Pick<Project, 'id' | 'title'>[];
  /** Фрагменты, которые попросили не распознавать. */
  ignore?: ReadonlySet<string>;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

const WEEKDAYS: Record<string, number> = {};
[
  ['пн', 'пон', 'понедельник', 'понедельника', 'понедельнику', 'понедельникам', 'понедельники'],
  ['вт', 'втор', 'вторник', 'вторника', 'вторнику', 'вторникам', 'вторники'],
  ['ср', 'среда', 'среду', 'среды', 'среде', 'средам'],
  ['чт', 'четв', 'четверг', 'четверга', 'четвергу', 'четвергам', 'четверги'],
  ['пт', 'пятн', 'пятница', 'пятницу', 'пятницы', 'пятнице', 'пятницам'],
  ['сб', 'суб', 'суббота', 'субботу', 'субботы', 'субботе', 'субботам'],
  ['вс', 'воскр', 'воскресенье', 'воскресенья', 'воскресенью', 'воскресеньям'],
].forEach((forms, day) => forms.forEach((form) => (WEEKDAYS[form] = day)));

const MONTHS: Record<string, number> = {};
[
  ['янв', 'январь', 'января'],
  ['фев', 'февр', 'февраль', 'февраля'],
  ['мар', 'март', 'марта'],
  ['апр', 'апрель', 'апреля'],
  ['май', 'мая'],
  ['июн', 'июнь', 'июня'],
  ['июл', 'июль', 'июля'],
  ['авг', 'август', 'августа'],
  ['сен', 'сент', 'сентябрь', 'сентября'],
  ['окт', 'октябрь', 'октября'],
  ['ноя', 'нояб', 'ноябрь', 'ноября'],
  ['дек', 'декабрь', 'декабря'],
].forEach((forms, i) => forms.forEach((form) => (MONTHS[form] = i + 1)));

const UNITS: Record<string, RepeatUnit> = {
  день: 'day',
  дня: 'day',
  дней: 'day',
  неделя: 'week',
  неделю: 'week',
  недели: 'week',
  недель: 'week',
  месяц: 'month',
  месяца: 'month',
  месяцев: 'month',
  год: 'year',
  года: 'year',
  лет: 'year',
};

const NUMBER_WORDS: Record<string, number> = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };

const EVERY = new Set(['каждый', 'каждую', 'каждое', 'каждые']);
const DEADLINE_PREPS = new Set(['до', 'к', 'ко']);
const PLAN_PREPS = new Set(['в', 'во', 'на']);
/** После этих предлогов дата относится к чему-то другому: «с 5 окт», «после 15.10». */
const OTHER_PREPS = new Set(['с', 'со', 'от', 'после', 'перед', 'между', 'про', 'о', 'об', 'за', 'из', 'для', 'у', 'около', 'по']);

interface Word {
  raw: string;
  /** В нижнем регистре, ё → е, без знаков препинания в конце. */
  key: string;
}

function words(text: string): Word[] {
  return (text.match(/\S+/g) ?? []).map((raw) => {
    const lower = norm(raw);
    // «!!» — это важность, а не знаки препинания.
    const key = /[\p{L}\d]/u.test(lower) ? lower.replace(/[.,;:!?)»"]+$/u, '').replace(/^[(«"]+/u, '') : lower;
    return { raw, key };
  });
}

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** День и месяц без года — ближайший такой день, начиная с сегодня. 29 февраля — в ближайший високосный год. */
function nearestDate(day: number, month: number, today: IsoDate): IsoDate | null {
  const year = Number(today.slice(0, 4));
  for (let y = year; y < year + 8; y++) {
    if (isValidDate(y, month, day) && iso(y, month, day) >= today) return iso(y, month, day);
  }
  return null;
}

/** Ближайший такой день недели, начиная с сегодня: «в пт» в пятницу — сегодня. */
function nearestWeekday(day: number, today: IsoDate): IsoDate {
  return addDays(today, (day - weekdayIndex(today) + 7) % 7);
}

function parseNumber(key: string | undefined): number | null {
  if (key === undefined) return null;
  if (/^\d{1,2}$/.test(key)) return Number(key) || null;
  return NUMBER_WORDS[key] ?? null;
}

/** Дни недели в одном слове: «пн», «пятницам», «пн,ср». */
function dayWord(word: Word | undefined): number[] | null {
  const parts = word?.key.split(',').filter(Boolean) ?? [];
  return parts.length > 0 && parts.every((p) => WEEKDAYS[p] !== undefined) ? parts.map((p) => WEEKDAYS[p]) : null;
}

/** Список дней недели: «пн и чт», «пн, ср, пт», «средам и пятницам». Возвращает дни и число слов. */
function weekdayList(ws: Word[], i: number): { days: number[]; length: number } | null {
  const days: number[] = [];
  let j = i;
  for (let found = dayWord(ws[j]); found; found = dayWord(ws[j])) {
    days.push(...found);
    j += 1;
    // Следующий день — после запятой («пн, ср») или союза «и» («пн и чт»).
    if (ws[j - 1].raw.endsWith(',')) continue;
    if (ws[j]?.key === 'и' && dayWord(ws[j + 1])) {
      j += 1;
      continue;
    }
    break;
  }
  return days.length > 0 ? { days: [...new Set(days)].sort((a, b) => a - b), length: j - i } : null;
}

/** Дата после предлога или без него: «пт», «15 окт», «15.10», «завтра». */
function dateAt(ws: Word[], i: number, today: IsoDate, { weekday }: { weekday: boolean }): { date: IsoDate; length: number } | null {
  const key = ws[i]?.key;
  if (key === undefined) return null;
  if (key === 'сегодня') return { date: today, length: 1 };
  if (key === 'завтра') return { date: addDays(today, 1), length: 1 };
  if (key === 'послезавтра') return { date: addDays(today, 2), length: 1 };
  if (weekday && WEEKDAYS[key] !== undefined) return { date: nearestWeekday(WEEKDAYS[key], today), length: 1 };

  const numeric = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/.exec(key);
  if (numeric) {
    const [d, m] = [Number(numeric[1]), Number(numeric[2])];
    if (numeric[3]) {
      const y = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
      return isValidDate(y, m, d) ? { date: iso(y, m, d), length: 1 } : null;
    }
    const date = m >= 1 && m <= 12 ? nearestDate(d, m, today) : null;
    return date ? { date, length: 1 } : null;
  }

  const month = MONTHS[ws[i + 1]?.key ?? ''];
  if (/^\d{1,2}$/.test(key) && month) {
    const date = nearestDate(Number(key), month, today);
    return date ? { date, length: 2 } : null;
  }
  return null;
}

/** «каждый день», «каждые 2 недели по пт», «каждое вс», «по будням», «раз в месяц», «ежедневно». */
function repeatAt(ws: Word[], i: number): { rule: Omit<Recurrence, 'start'>; length: number } | null {
  const key = ws[i].key;
  const simple: Record<string, RepeatUnit> = { ежедневно: 'day', еженедельно: 'week', ежемесячно: 'month', ежегодно: 'year' };
  if (simple[key]) return { rule: { unit: simple[key], interval: 1, weekdays: [] }, length: 1 };

  if (key === 'по') {
    const next = ws[i + 1]?.key;
    if (next === 'будням') return { rule: { unit: 'week', interval: 1, weekdays: [0, 1, 2, 3, 4] }, length: 2 };
    if (next === 'выходным') return { rule: { unit: 'week', interval: 1, weekdays: [5, 6] }, length: 2 };
    const list = weekdayList(ws, i + 1);
    return list ? { rule: { unit: 'week', interval: 1, weekdays: list.days }, length: 1 + list.length } : null;
  }

  let length: number;
  let interval = 1;
  let unit: RepeatUnit | undefined;
  if (EVERY.has(key)) {
    const list = weekdayList(ws, i + 1);
    if (list) return { rule: { unit: 'week', interval: 1, weekdays: list.days }, length: 1 + list.length };
    const n = parseNumber(ws[i + 1]?.key);
    if (n !== null) {
      interval = n;
      unit = UNITS[ws[i + 2]?.key ?? ''];
      length = 3;
    } else {
      unit = UNITS[ws[i + 1]?.key ?? ''];
      length = 2;
    }
  } else if (key === 'раз' && ws[i + 1]?.key === 'в') {
    const n = parseNumber(ws[i + 2]?.key);
    interval = n ?? 1;
    unit = UNITS[ws[i + (n === null ? 2 : 3)]?.key ?? ''];
    length = n === null ? 3 : 4;
  } else {
    return null;
  }
  if (!unit) return null;
  // «каждые 2 недели по пт».
  if (unit === 'week' && ws[i + length]?.key === 'по') {
    const list = weekdayList(ws, i + length + 1);
    if (list) return { rule: { unit, interval, weekdays: list.days }, length: length + 1 + list.length };
  }
  return { rule: { unit, interval, weekdays: [] }, length };
}

/** «через 3 дня», «через неделю», «через 2 месяца». */
function afterAt(ws: Word[], i: number, today: IsoDate): { date: IsoDate; length: number } | null {
  if (ws[i].key !== 'через') return null;
  const n = parseNumber(ws[i + 1]?.key);
  const unit = UNITS[ws[i + (n === null ? 1 : 2)]?.key ?? ''];
  // «через день» двусмысленно (завтра или через один) — не распознаём.
  if (!unit || (n === null && unit === 'day')) return null;
  const count = n ?? 1;
  const date =
    unit === 'day'
      ? addDays(today, count)
      : unit === 'week'
        ? addDays(today, 7 * count)
        : addMonths(today, unit === 'month' ? count : 12 * count);
  return { date, length: n === null ? 2 : 3 };
}

/** Последний день месяца. */
function monthEnd(today: IsoDate): IsoDate {
  return addDays(addMonths(`${today.slice(0, 8)}01`, 1), -1);
}

const hashKey = (s: string) => norm(s).replace(/[\s_-]+/g, '');

export function parseTask(text: string, ctx: ParseContext): ParsedTask {
  const { today, ignore } = ctx;
  const ws = words(text);
  const result: ParsedTask = {
    title: '',
    important: false,
    plannedDate: null,
    deadline: null,
    recurrence: null,
    areaId: null,
    projectId: null,
    tokens: [],
  };
  let repeat: Omit<Recurrence, 'start'> | null = null;
  const kept: string[] = [];

  type Match = { kind: TokenKind; length: number; apply: () => void };

  function matchAt(i: number): Match | null {
    const key = ws[i].key;

    if (!result.important && /^(!!+|!важно)$/.test(key)) {
      return { kind: 'important', length: 1, apply: () => (result.important = true) };
    }

    if (key.startsWith('#') && key.length > 2) {
      const tag = hashKey(key.slice(1));
      if (result.areaId === null) {
        const exact = ctx.areas.filter((a) => hashKey(a.name) === tag);
        const byPrefix = ctx.areas.filter((a) => hashKey(a.name).startsWith(tag));
        const area = exact.length === 1 ? exact[0] : byPrefix.length === 1 ? byPrefix[0] : null;
        if (area) return { kind: 'area', length: 1, apply: () => (result.areaId = area.id) };
      }
      if (result.projectId === null) {
        const found = ctx.projects.filter(
          (p) => hashKey(p.title).startsWith(tag) || norm(p.title).split(/\s+/).some((w) => hashKey(w).startsWith(tag)),
        );
        if (found.length === 1) return { kind: 'project', length: 1, apply: () => (result.projectId = found[0].id) };
      }
      return null;
    }

    if (repeat === null) {
      const found = repeatAt(ws, i);
      if (found) return { kind: 'repeat', length: found.length, apply: () => (repeat = found.rule) };
    }

    if (result.deadline === null && DEADLINE_PREPS.has(key)) {
      if (ws[i + 1]?.key === 'конца' && (ws[i + 2]?.key === 'недели' || ws[i + 2]?.key === 'месяца')) {
        const date = ws[i + 2].key === 'недели' ? nearestWeekday(6, today) : monthEnd(today);
        return { kind: 'deadline', length: 3, apply: () => (result.deadline = date) };
      }
      const found = dateAt(ws, i + 1, today, { weekday: true });
      if (found) return { kind: 'deadline', length: 1 + found.length, apply: () => (result.deadline = found.date) };
    }

    if (result.plannedDate === null) {
      if (PLAN_PREPS.has(key)) {
        const next = ws[i + 1]?.key;
        if (next === 'выходные' || next === 'выходных') {
          // В воскресенье «на выходных» — это уже сегодня.
          const date = weekdayIndex(today) === 6 ? today : nearestWeekday(5, today);
          return { kind: 'plan', length: 2, apply: () => (result.plannedDate = date) };
        }
        const found = dateAt(ws, i + 1, today, { weekday: true });
        if (found) return { kind: 'plan', length: 1 + found.length, apply: () => (result.plannedDate = found.date) };
      }
      const after = afterAt(ws, i, today);
      if (after) return { kind: 'plan', length: after.length, apply: () => (result.plannedDate = after.date) };
      const prev = ws[i - 1]?.key ?? '';
      if (!OTHER_PREPS.has(prev) && !DEADLINE_PREPS.has(prev) && !PLAN_PREPS.has(prev)) {
        const found = dateAt(ws, i, today, { weekday: false });
        if (found) return { kind: 'plan', length: found.length, apply: () => (result.plannedDate = found.date) };
      }
    }
    return null;
  }

  for (let i = 0; i < ws.length; ) {
    const match = matchAt(i);
    if (!match) {
      kept.push(ws[i].raw);
      i += 1;
      continue;
    }
    const fragment = ws.slice(i, i + match.length).map((w) => w.raw);
    // Отменённый фрагмент остаётся текстом целиком: «по пт» внутри «каждые 2 недели по пт» тоже.
    if (ignore?.has(fragment.join(' '))) {
      kept.push(...fragment);
    } else {
      match.apply();
      result.tokens.push({ kind: match.kind, text: fragment.join(' ') });
    }
    i += match.length;
  }

  if (repeat !== null) {
    const rule: Omit<Recurrence, 'start'> = repeat;
    const anchor = result.plannedDate ?? result.deadline ?? today;
    // «каждую неделю» без дней — в день недели задачи.
    const weekdays = rule.unit === 'week' && rule.weekdays.length === 0 ? [weekdayIndex(anchor)] : rule.weekdays;
    const settled = anchorRecurrence({ ...rule, weekdays, start: anchor }, result, today);
    result.recurrence = settled.recurrence;
    result.plannedDate = settled.plannedDate;
    result.deadline = settled.deadline;
  }

  // Хвост «, до пт» оставил бы запятую или тире в конце названия.
  result.title = kept.join(' ').replace(/[\s,;:—–-]+$/u, '').replace(/^[\s,;:—–-]+/u, '');
  return result;
}

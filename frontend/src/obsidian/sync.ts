import type { Area, Material, Note } from '../domain/types';
import { addDays, type IsoDate } from '../lib/dates';
import type { ParsedVault } from './parse';
import { obsidianUri } from './uri';

export type { ParsedVault } from './parse';

export interface SyncReport {
  vaultName: string;
  filesRead: number;
  notesCreated: string[];
  notesUpdated: string[];
  /** Заметки, созданные в трекере вручную, которые связались с файлом с тем же названием. */
  notesLinked: string[];
  /** Файл переименовали или перенесли — история повторений сохранена. */
  notesRenamed: string[];
  notesUnchanged: number;
  materialsCreated: string[];
  materialsUpdated: string[];
  /** Заметки из Obsidian, которых больше нет в хранилище или у которых убрали тег review. */
  missing: { id: string; title: string }[];
  withoutQuestions: string[];
  /** Если новых заметок много, их первые повторения распределены по дням — до этой даты. */
  firstReviewsUntil: IsoDate | null;
}

/**
 * Сколько новых заметок из Obsidian вводится в повторение за день.
 * Иначе импорт сотни старых заметок превратится в сотню повторений на завтра.
 */
export const NEW_NOTES_PER_DAY = 5;

export interface SyncCtx {
  today: IsoDate;
  now: string;
  newId: () => string;
}

const key = (text: string) => text.trim().toLocaleLowerCase('ru');

function sameFields<T extends object>(a: T, b: T, fields: (keyof T)[]): boolean {
  return fields.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

/**
 * Переносит содержимое хранилища в данные трекера. Чистая функция: возвращает новые списки и отчёт.
 * Правила:
 * - заметка узнаётся по пути к файлу; если файл переименовали, — по названию среди «пропавших»;
 *   заметка, созданная в трекере вручную, связывается с файлом с тем же названием;
 * - из Obsidian обновляются название, вопросы, суть, ссылка и материал (если он указан в файле),
 *   а статус, дата добавления и история повторений остаются в трекере;
 * - материал берётся со страницы с `type: material` или создаётся по ссылке из свойства material;
 *   статус материала ведётся в трекере и при синхронизации не меняется.
 */
export function applyVault(
  current: { areas: Area[]; materials: Material[]; notes: Note[] },
  vault: ParsedVault,
  ctx: SyncCtx,
): { materials: Material[]; notes: Note[]; report: SyncReport } {
  const report: SyncReport = {
    vaultName: vault.vaultName,
    filesRead: vault.filesRead,
    notesCreated: [],
    notesUpdated: [],
    notesLinked: [],
    notesRenamed: [],
    notesUnchanged: 0,
    materialsCreated: [],
    materialsUpdated: [],
    missing: [],
    withoutQuestions: [],
    firstReviewsUntil: null,
  };
  const areaByName = new Map(current.areas.map((a) => [key(a.name), a.id]));
  const materials = current.materials.map((m) => ({ ...m }));
  const notes = current.notes.map((n) => ({ ...n }));

  // --- материалы со своих страниц ---
  for (const parsed of vault.materials) {
    const existing =
      materials.find((m) => m.obsidianPath === parsed.path) ??
      materials.find((m) => m.obsidianPath === null && key(m.title) === key(parsed.title));
    const areaId = parsed.areaName ? (areaByName.get(key(parsed.areaName)) ?? null) : null;
    const fields = {
      title: parsed.title,
      type: parsed.type,
      author: parsed.author,
      url: parsed.url,
      obsidianPath: parsed.path,
    };
    if (existing) {
      const next = { ...existing, ...fields, areaId: parsed.areaName ? areaId : existing.areaId };
      if (!sameFields(existing, next, ['title', 'type', 'author', 'url', 'obsidianPath', 'areaId'])) {
        Object.assign(existing, next);
        report.materialsUpdated.push(parsed.title);
      }
    } else {
      materials.push({ ...fields, id: ctx.newId(), areaId, status: 'active', createdAt: ctx.now });
      report.materialsCreated.push(parsed.title);
    }
  }

  function resolveMaterial(ref: string): string {
    const found = materials.find((m) => key(m.title) === key(ref));
    if (found) return found.id;
    const created: Material = {
      id: ctx.newId(),
      title: ref,
      type: 'other',
      author: '',
      url: '',
      areaId: null,
      status: 'active',
      obsidianPath: null,
      createdAt: ctx.now,
    };
    materials.push(created);
    report.materialsCreated.push(ref);
    return created.id;
  }

  // --- заметки ---
  // Сколько заметок уже вводится в каждый из ближайших дней (с прошлых импортов).
  const introduced = new Map<IsoDate, number>();
  for (const n of notes) {
    if (n.addedOn >= ctx.today) introduced.set(n.addedOn, (introduced.get(n.addedOn) ?? 0) + 1);
  }
  function nextIntroductionDay(): IsoDate {
    let day = ctx.today;
    while ((introduced.get(day) ?? 0) >= NEW_NOTES_PER_DAY) day = addDays(day, 1);
    introduced.set(day, (introduced.get(day) ?? 0) + 1);
    return day;
  }

  const vaultPaths = new Set(vault.notes.map((n) => n.path));
  const matched = new Set<string>();
  const findUnmatched = (predicate: (n: Note) => boolean) => notes.find((n) => !matched.has(n.id) && predicate(n));

  for (const parsed of vault.notes) {
    const fields = {
      title: parsed.title,
      questions: parsed.questions,
      summary: parsed.summary,
      obsidianUri: obsidianUri(vault.vaultName, parsed.path),
      obsidianPath: parsed.path,
    };
    const materialId = parsed.materialRef ? resolveMaterial(parsed.materialRef) : undefined;
    if (parsed.questions.length === 0) report.withoutQuestions.push(parsed.title);

    let existing = findUnmatched((n) => n.obsidianPath === parsed.path);
    let via: 'path' | 'rename' | 'link' = 'path';
    if (!existing) {
      existing = findUnmatched((n) => n.obsidianPath !== null && !vaultPaths.has(n.obsidianPath) && key(n.title) === key(parsed.title));
      via = 'rename';
    }
    if (!existing) {
      existing = findUnmatched((n) => n.obsidianPath === null && key(n.title) === key(parsed.title));
      via = 'link';
    }

    if (existing) {
      matched.add(existing.id);
      const next: Note = { ...existing, ...fields, materialId: materialId ?? existing.materialId };
      const changed = !sameFields(existing, next, ['title', 'questions', 'summary', 'obsidianUri', 'obsidianPath', 'materialId']);
      Object.assign(existing, next);
      if (via === 'rename') report.notesRenamed.push(parsed.title);
      else if (via === 'link') report.notesLinked.push(parsed.title);
      else if (changed) report.notesUpdated.push(parsed.title);
      else report.notesUnchanged += 1;
    } else {
      const note: Note = {
        ...fields,
        id: ctx.newId(),
        materialId: materialId ?? null,
        status: 'active',
        // Заметка из хранилища могла быть написана давно, но повторять её начинаем с момента импорта.
        addedOn: nextIntroductionDay(),
        createdAt: ctx.now,
      };
      notes.push(note);
      matched.add(note.id);
      report.notesCreated.push(parsed.title);
    }
  }

  const lastIntroduction = [...introduced.keys()].sort().at(-1);
  if (report.notesCreated.length > 0 && lastIntroduction && lastIntroduction > ctx.today) {
    report.firstReviewsUntil = addDays(lastIntroduction, 1);
  }

  report.missing = notes
    .filter((n) => n.obsidianPath !== null && !matched.has(n.id) && n.status === 'active')
    .map((n) => ({ id: n.id, title: n.title }));

  return { materials, notes, report };
}

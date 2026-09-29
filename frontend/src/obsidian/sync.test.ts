import { describe, expect, it } from 'vitest';
import type { Area, Material, Note } from '../domain/types';
import { parseVault, type ParsedMaterial, type ParsedNote } from './parse';
import { applyVault, type ParsedVault, type SyncCtx } from './sync';

function ctx(): SyncCtx {
  let n = 0;
  return { today: '2026-10-01', now: '2026-10-01T10:00:00.000Z', newId: () => `new-${++n}` };
}

const limits = { settings: { newNotesPerDay: 5, activeMaterialsLimit: 3 }, vacations: [] };

const areas: Area[] = [{ id: 'a-study', name: 'Учёба', color: 'clay', icon: 'study', order: 0, createdAt: 'x' }];

function parsedNote(overrides: Partial<ParsedNote> = {}): ParsedNote {
  return {
    path: 'Заметки/Графы.md',
    title: 'Графы',
    questions: ['Почему BFS?'],
    summary: 'BFS — очередь.',
    materialRef: null,
    ...overrides,
  };
}

function vault(notes: ParsedNote[], materials: ParsedMaterial[] = []): ParsedVault {
  return { vaultName: 'Study', notes, materials, filesRead: notes.length + materials.length };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'Графы',
    materialId: null,
    questions: [],
    summary: '',
    obsidianUri: '',
    status: 'active',
    addedOn: '2026-09-01',
    obsidianPath: null,
    createdAt: 'x',
    ...overrides,
  };
}

describe('applyVault', () => {
  it('создаёт новые заметки со ссылкой obsidian://, первое повторение — завтра', () => {
    const result = applyVault({ ...limits, areas, materials: [], notes: [] }, vault([parsedNote()]), ctx());
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      title: 'Графы',
      obsidianPath: 'Заметки/Графы.md',
      obsidianUri: 'obsidian://open?vault=Study&file=%D0%97%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8%2F%D0%93%D1%80%D0%B0%D1%84%D1%8B',
      addedOn: '2026-10-01',
      status: 'active',
    });
    expect(result.report.notesCreated).toEqual(['Графы']);
    expect(result.report.firstReviewsUntil).toBeNull();
  });

  it('много новых заметок вводятся по newNotesPerDay в день', () => {
    const many = Array.from({ length: 12 }, (_, i) => parsedNote({ path: `n${i}.md`, title: `Заметка ${i}` }));
    const result = applyVault({ ...limits, areas, materials: [], notes: [] }, vault(many), ctx());
    const perDay = new Map<string, number>();
    for (const n of result.notes) perDay.set(n.addedOn, (perDay.get(n.addedOn) ?? 0) + 1);
    expect([...perDay]).toEqual([
      ['2026-10-01', 5],
      ['2026-10-02', 5],
      ['2026-10-03', 2],
    ]);
    expect(result.report.firstReviewsUntil).toBe('2026-10-04');
  });

  it('лимит новых заметок в день берётся из настроек, дни отпуска пропускаются', () => {
    const many = Array.from({ length: 5 }, (_, i) => parsedNote({ path: `n${i}.md`, title: `Заметка ${i}` }));
    const vacations = [{ id: 'v', start: '2026-10-02', end: '2026-10-03', createdAt: 'x' }];
    const result = applyVault(
      { ...limits, areas, materials: [], notes: [], settings: { newNotesPerDay: 2, activeMaterialsLimit: 3 }, vacations },
      vault(many),
      ctx(),
    );
    expect(result.notes.map((n) => n.addedOn)).toEqual(['2026-10-01', '2026-10-01', '2026-10-04', '2026-10-04', '2026-10-05']);
    expect(result.report.newNotesPerDay).toBe(2);
  });

  it('новые материалы сверх лимита «Изучаю» встают в очередь', () => {
    const active: Material = {
      id: 'm1',
      title: 'Уже изучаю',
      type: 'book',
      author: '',
      url: '',
      areaId: null,
      status: 'active',
      obsidianPath: null,
      createdAt: 'x',
    };
    const notes = ['А', 'Б', 'В'].map((ref, i) => parsedNote({ path: `${i}.md`, title: `Заметка ${i}`, materialRef: ref }));
    const result = applyVault(
      { ...limits, areas, materials: [active], notes: [], settings: { newNotesPerDay: 5, activeMaterialsLimit: 2 }, vacations: [] },
      vault(notes),
      ctx(),
    );
    expect(result.materials.map((m) => [m.title, m.status])).toEqual([
      ['Уже изучаю', 'active'],
      ['А', 'active'],
      ['Б', 'queued'],
      ['В', 'queued'],
    ]);
    expect(result.report.materialsQueued).toEqual(['Б', 'В']);
    expect(result.report.activeMaterialsLimit).toBe(2);
  });

  it('следующий импорт учитывает заметки, уже распределённые на ближайшие дни', () => {
    const first = applyVault(
      { ...limits, areas, materials: [], notes: [] },
      vault(Array.from({ length: 7 }, (_, i) => parsedNote({ path: `a${i}.md`, title: `А ${i}` }))),
      ctx(),
    );
    const more = [...first.notes.map((n) => parsedNote({ path: n.obsidianPath!, title: n.title })), parsedNote({ path: 'b.md', title: 'Б' })];
    const second = applyVault({ ...limits, areas, materials: first.materials, notes: first.notes }, vault(more), ctx());
    expect(second.notes.find((n) => n.title === 'Б')?.addedOn).toBe('2026-10-02');
  });

  it('повторная синхронизация обновляет текст, но сохраняет статус и дату добавления', () => {
    const first = applyVault({ ...limits, areas, materials: [], notes: [] }, vault([parsedNote()]), ctx());
    const paused = first.notes.map((n) => ({ ...n, status: 'paused' as const }));
    const second = applyVault(
      { ...limits, areas, materials: first.materials, notes: paused },
      vault([parsedNote({ questions: ['Почему BFS?', 'Когда DFS?'] })]),
      ctx(),
    );
    expect(second.notes).toHaveLength(1);
    expect(second.notes[0].id).toBe(first.notes[0].id);
    expect(second.notes[0].questions).toHaveLength(2);
    expect(second.notes[0].status).toBe('paused');
    expect(second.notes[0].addedOn).toBe('2026-10-01');
    expect(second.report.notesUpdated).toEqual(['Графы']);
  });

  it('без изменений — ничего не обновляется', () => {
    const first = applyVault({ ...limits, areas, materials: [], notes: [] }, vault([parsedNote()]), ctx());
    const second = applyVault({ ...limits, areas, materials: first.materials, notes: first.notes }, vault([parsedNote()]), ctx());
    expect(second.report.notesUnchanged).toBe(1);
    expect(second.report.notesUpdated).toEqual([]);
  });

  it('переименованный файл узнаётся по названию, id и история сохраняются', () => {
    const existing = note({ obsidianPath: 'Входящие/Графы.md' });
    const result = applyVault({ ...limits, areas, materials: [], notes: [existing] }, vault([parsedNote()]), ctx());
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ id: 'n1', obsidianPath: 'Заметки/Графы.md', addedOn: '2026-09-01' });
    expect(result.report.notesRenamed).toEqual(['Графы']);
    expect(result.report.missing).toEqual([]);
  });

  it('заметка, созданная вручную, связывается с файлом с тем же названием', () => {
    const manual = note({ title: 'графы' });
    const result = applyVault({ ...limits, areas, materials: [], notes: [manual] }, vault([parsedNote()]), ctx());
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ id: 'n1', title: 'Графы', obsidianPath: 'Заметки/Графы.md' });
    expect(result.report.notesLinked).toEqual(['Графы']);
  });

  it('пропавшие из хранилища заметки попадают в отчёт, но не удаляются', () => {
    const gone = note({ id: 'gone', title: 'Старая', obsidianPath: 'Заметки/Старая.md' });
    const pausedGone = note({ id: 'paused', title: 'На паузе', obsidianPath: 'Заметки/Пауза.md', status: 'paused' });
    const manual = note({ id: 'manual', title: 'Ручная' });
    const result = applyVault({ ...limits, areas, materials: [], notes: [gone, pausedGone, manual] }, vault([parsedNote()]), ctx());
    expect(result.notes.map((n) => n.id)).toEqual(['gone', 'paused', 'manual', 'new-1']);
    expect(result.report.missing).toEqual([{ id: 'gone', title: 'Старая' }]);
  });

  it('материал: со страницы, со сферой по названию; ссылка из заметки находит его', () => {
    const material: ParsedMaterial = {
      path: 'Материалы/Алгоритмы.md',
      title: 'Алгоритмы',
      type: 'course',
      author: 'Stepik',
      url: '',
      areaName: 'учёба',
    };
    const result = applyVault(
      { ...limits, areas, materials: [], notes: [] },
      vault([parsedNote({ materialRef: 'алгоритмы' })], [material]),
      ctx(),
    );
    expect(result.materials).toHaveLength(1);
    expect(result.materials[0]).toMatchObject({ title: 'Алгоритмы', areaId: 'a-study', status: 'active', obsidianPath: 'Материалы/Алгоритмы.md' });
    expect(result.notes[0].materialId).toBe(result.materials[0].id);
  });

  it('материал по ссылке без страницы создаётся; статус материала из трекера не перезаписывается', () => {
    const existing: Material = {
      id: 'm1',
      title: 'Алгоритмы',
      type: 'course',
      author: '',
      url: '',
      areaId: null,
      status: 'done',
      obsidianPath: 'Материалы/Алгоритмы.md',
      createdAt: 'x',
    };
    const page: ParsedMaterial = { path: 'Материалы/Алгоритмы.md', title: 'Алгоритмы', type: 'course', author: 'Кормен', url: '', areaName: null };
    const result = applyVault(
      { ...limits, areas, materials: [existing], notes: [] },
      vault([parsedNote({ materialRef: 'English Grammar in Use' })], [page]),
      ctx(),
    );
    expect(result.materials.find((m) => m.id === 'm1')).toMatchObject({ status: 'done', author: 'Кормен' });
    expect(result.report.materialsUpdated).toEqual(['Алгоритмы']);
    expect(result.report.materialsCreated).toEqual(['English Grammar in Use']);
    expect(result.materials.find((m) => m.title === 'English Grammar in Use')).toMatchObject({ type: 'other', status: 'active' });
  });

  it('заметка без материала в файле сохраняет материал, выбранный в трекере', () => {
    const existing = note({ obsidianPath: 'Заметки/Графы.md', materialId: 'm1' });
    const result = applyVault({ ...limits, areas, materials: [], notes: [existing] }, vault([parsedNote()]), ctx());
    expect(result.notes[0].materialId).toBe('m1');
  });

  it('заметки без вопросов перечисляются в отчёте', () => {
    const result = applyVault({ ...limits, areas, materials: [], notes: [] }, vault([parsedNote({ questions: [] })]), ctx());
    expect(result.report.withoutQuestions).toEqual(['Графы']);
  });
});

describe('parseVault', () => {
  it('разбирает файлы и пропускает лишнее', () => {
    const result = parseVault('Study', [
      { path: 'a.md', content: '#review\n## Вопросы\n- Почему?' },
      { path: 'b.md', content: 'Обычная заметка' },
      { path: 'm.md', content: '---\ntype: material\n---' },
    ]);
    expect(result.notes.map((n) => n.path)).toEqual(['a.md']);
    expect(result.materials.map((m) => m.path)).toEqual(['m.md']);
    expect(result.filesRead).toBe(3);
  });
});

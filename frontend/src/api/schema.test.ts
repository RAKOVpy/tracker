import { describe, expect, it } from 'vitest';
import { createEmptyDb, DataError, migrate, parseBackup, SCHEMA_VERSION, toBackup, validateDb, type Ctx } from './schema';

function makeCtx(): Ctx {
  let n = 0;
  return { now: '2026-09-29T10:00:00.000Z', newId: () => `id-${++n}` };
}

const v1Goal = {
  id: 'g1',
  title: 'Прочитать книгу',
  description: '',
  category: 'reading',
  unit: 'стр.',
  targetValue: 300,
  startDate: '2026-09-01',
  deadline: '2026-09-30',
  priority: 'high',
  status: 'active',
  createdAt: '2026-09-01T08:00:00.000Z',
};

const v1Data = {
  goals: [
    v1Goal,
    { ...v1Goal, id: 'g2', title: 'Медитация', category: 'other' },
    { ...v1Goal, id: 'g3', title: 'Английский', category: 'language' },
  ],
  entries: [{ id: 'e1', goalId: 'g1', date: '2026-09-02', value: 20, note: '', createdAt: '2026-09-02T20:00:00.000Z' }],
};

/** Данные в формате v2: как их хранила предыдущая версия приложения. */
function migrateToV2() {
  const { materials: _m, notes: _n, reviews: _r, settings: _s, vacations: _v, tasks: _t, projects: _p, ...v2 } = migrate(v1Data, makeCtx());
  return v2;
}

describe('migrate', () => {
  it('v1 → v2: категории превращаются в сферы, «другое» остаётся без сферы', () => {
    const db = migrate(v1Data, makeCtx());
    expect(db.areas.map((a) => a.name)).toEqual(['Чтение', 'Языки', 'Спорт', 'Учёба']);
    const [reading, languages] = db.areas;
    expect(db.goals.map((g) => g.areaId)).toEqual([reading.id, null, languages.id]);
    expect(db.goals[0]).not.toHaveProperty('category');
    expect(db.entries).toHaveLength(1);
  });

  it('v3 → v4: у заметок и материалов появляется obsidianPath = null', () => {
    const note = { id: 'n1', title: 'Т', materialId: null, questions: [], summary: '', obsidianUri: '', status: 'active', addedOn: '2026-09-01', createdAt: 'x' };
    const db = migrate({ version: 3, ...migrateToV2(), materials: [], notes: [note], reviews: [] }, makeCtx());
    expect(db.notes[0].obsidianPath).toBeNull();
  });

  it('v4 → v5: настройки нагрузки по умолчанию и пустой список отпусков', () => {
    const db = migrate({ version: 4, ...migrateToV2(), materials: [], notes: [], reviews: [] }, makeCtx());
    expect(db.settings).toEqual({ dailyReviewLimit: 15, activeMaterialsLimit: 3, newNotesPerDay: 5, strictMode: false });
    expect(db.vacations).toEqual([]);
  });

  it('v5 → v6: появляется пустой список задач', () => {
    const v5 = { version: 5, ...migrateToV2(), materials: [], notes: [], reviews: [], settings: {}, vacations: [] };
    expect(migrate(v5, makeCtx()).tasks).toEqual([]);
  });

  it('v6 → v7: появляются проекты, у задач — пустые проект и веха', () => {
    const oldTask = { id: 't1', title: 'Т', notes: '', status: 'todo', important: false, deadline: null, plannedDate: null, areaId: null, checklist: [], completedAt: null, createdAt: 'x' };
    const v6 = { version: 6, ...migrateToV2(), materials: [], notes: [], reviews: [], settings: {}, vacations: [], tasks: [oldTask] };
    const db = migrate(v6, makeCtx());
    expect(db.projects).toEqual([]);
    expect(db.tasks[0]).toMatchObject({ projectId: null, milestoneId: null });
  });

  it('v2 → v3: добавляются пустые списки знаний', () => {
    const v2 = { version: 2, ...migrateToV2() };
    const db = migrate(v2, makeCtx());
    expect(db.materials).toEqual([]);
    expect(db.notes).toEqual([]);
    expect(db.reviews).toEqual([]);
    expect(db.goals).toHaveLength(3);
  });

  it('данные текущей версии не меняются', () => {
    const db = migrate(v1Data, makeCtx());
    expect(migrate({ version: SCHEMA_VERSION, ...db }, makeCtx())).toEqual(db);
  });

  it('данные из будущей версии не принимаются', () => {
    expect(() => migrate({ version: SCHEMA_VERSION + 1, areas: [], goals: [], entries: [] }, makeCtx())).toThrow(
      /более новой версией/,
    );
  });
});

describe('validateDb', () => {
  const base = () => migrate(v1Data, makeCtx());

  it('отбрасывает лишние поля', () => {
    const db = base();
    const dirty = { ...db, goals: db.goals.map((g) => ({ ...g, junk: 1 })) };
    expect(validateDb(dirty).goals[0]).not.toHaveProperty('junk');
  });

  it('чинит ссылку на удалённую сферу и выбрасывает записи удалённых целей', () => {
    const db = base();
    const broken = {
      ...db,
      goals: [{ ...db.goals[0], areaId: 'нет-такой' }],
      entries: [...db.entries, { ...db.entries[0], id: 'e2', goalId: 'нет-такой' }],
    };
    const fixed = validateDb(broken);
    expect(fixed.goals[0].areaId).toBeNull();
    expect(fixed.entries.map((e) => e.id)).toEqual(['e1']);
  });

  it('понятно объясняет, что не так', () => {
    const db = base();
    expect(() => validateDb({ ...db, goals: [{ ...db.goals[0], title: '' }] })).toThrow('Цель 1: поле «title»');
    expect(() => validateDb({ ...db, goals: [{ ...db.goals[0], deadline: '2026-08-01' }] })).toThrow(
      'дедлайн раньше даты старта',
    );
    expect(() => validateDb({ ...db, entries: [{ ...db.entries[0], date: '02.09.2026' }] })).toThrow('ГГГГ-ММ-ДД');
    // Шаблон подходит, но такого дня нет: иначе расчёты по датам молча съехали бы на март.
    expect(() => validateDb({ ...db, entries: [{ ...db.entries[0], date: '2026-02-30' }] })).toThrow('ГГГГ-ММ-ДД');
    expect(() => validateDb({ ...db, goals: [{ ...db.goals[0], startDate: '2026-13-01' }] })).toThrow('ГГГГ-ММ-ДД');
    expect(validateDb({ ...db, entries: [{ ...db.entries[0], date: '2028-02-29' }] }).entries[0].date).toBe('2028-02-29');
    expect(() => validateDb({ ...db, goals: [db.goals[0], db.goals[0]] })).toThrow('повторяется id');
  });
});

describe('знания', () => {
  function withKnowledge() {
    const db = migrate(v1Data, makeCtx());
    return {
      ...db,
      materials: [
        {
          id: 'm1',
          title: 'Алгоритмы',
          type: 'course',
          author: '',
          url: '',
          areaId: db.areas[3].id,
          status: 'active',
          obsidianPath: null,
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ],
      notes: [
        {
          id: 'n1',
          title: 'Графы',
          materialId: 'm1',
          questions: ['Чем BFS отличается от DFS?'],
          summary: 'BFS — очередь, DFS — стек.',
          obsidianUri: 'obsidian://open?vault=Study&file=Graphs',
          status: 'active',
          addedOn: '2026-09-01',
          obsidianPath: 'Заметки/Графы.md',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ],
      reviews: [
        { id: 'r1', noteId: 'n1', date: '2026-09-02', rating: 'good', explain: null, taught: false, createdAt: 'x' },
        { id: 'r2', noteId: 'n1', date: '2026-09-05', rating: 'easy', explain: 'yes', taught: true, createdAt: 'y' },
      ],
    };
  }

  it('проходят проверку без изменений', () => {
    const db = withKnowledge();
    expect(validateDb(db)).toEqual(db);
  });

  it('заметка удалённого материала остаётся без материала, повторения удалённой заметки отбрасываются', () => {
    const db = withKnowledge();
    const fixed = validateDb({
      ...db,
      materials: [],
      reviews: [...db.reviews, { ...db.reviews[0], id: 'r3', noteId: 'нет-такой' }],
    });
    expect(fixed.notes[0].materialId).toBeNull();
    expect(fixed.reviews.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('отклоняет ошибки в заметках и повторениях', () => {
    const db = withKnowledge();
    expect(() => validateDb({ ...db, notes: [{ ...db.notes[0], obsidianUri: 'https://example.com' }] })).toThrow(
      'obsidian://',
    );
    expect(() => validateDb({ ...db, notes: [{ ...db.notes[0], questions: [1] }] })).toThrow('списком строк');
    expect(() => validateDb({ ...db, reviews: [{ ...db.reviews[0], rating: 'perfect' }] })).toThrow('rating');
    expect(() => validateDb({ ...db, reviews: [{ ...db.reviews[0], taught: 'да' }] })).toThrow('true или false');
  });
});

describe('нагрузка', () => {
  const base = () => migrate(v1Data, makeCtx());
  const vacation = (id: string, start: string, end: string | null) => ({ id, start, end, createdAt: 'x' });

  it('настройки вне диапазона приводятся к допустимым, неизвестные поля отбрасываются', () => {
    const db = base();
    const fixed = validateDb({ ...db, settings: { dailyReviewLimit: 500, activeMaterialsLimit: 2.4, newNotesPerDay: 'пять', junk: 1 } });
    expect(fixed.settings).toEqual({ dailyReviewLimit: 100, activeMaterialsLimit: 2, newNotesPerDay: 5, strictMode: false });
  });

  it('отпуска сортируются по дате начала', () => {
    const db = base();
    const fixed = validateDb({ ...db, vacations: [vacation('b', '2026-10-10', null), vacation('a', '2026-09-01', '2026-09-05')] });
    expect(fixed.vacations.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('отклоняет пересекающиеся отпуска и неверные даты', () => {
    const db = base();
    expect(() =>
      validateDb({ ...db, vacations: [vacation('a', '2026-09-01', '2026-09-10'), vacation('b', '2026-09-10', '2026-09-12')] }),
    ).toThrow('пересекаются');
    expect(() =>
      validateDb({ ...db, vacations: [vacation('a', '2026-09-01', null), vacation('b', '2026-10-01', '2026-10-02')] }),
    ).toThrow('пересекаются');
    expect(() => validateDb({ ...db, vacations: [vacation('a', '2026-09-10', '2026-09-01')] })).toThrow('раньше');
  });
});

describe('задачи', () => {
  const base = () => migrate(v1Data, makeCtx());
  const task = (overrides: Record<string, unknown> = {}) => ({
    id: 't1',
    title: 'Сдать отчёт',
    notes: '',
    status: 'todo',
    important: true,
    deadline: '2026-10-09',
    plannedDate: null,
    areaId: null,
    projectId: null,
    milestoneId: null,
    checklist: [{ id: 'c1', text: 'Собрать цифры', done: true }],
    completedAt: null,
    createdAt: 'x',
    ...overrides,
  });

  it('проходят проверку без изменений', () => {
    const db = { ...base(), tasks: [task()] };
    expect(validateDb(db)).toEqual(db);
  });

  it('задача удалённой сферы остаётся без сферы', () => {
    expect(validateDb({ ...base(), tasks: [task({ areaId: 'нет-такой' })] }).tasks[0].areaId).toBeNull();
  });

  it('отклоняет ошибки', () => {
    const db = base();
    expect(() => validateDb({ ...db, tasks: [task({ status: 'later' })] })).toThrow('Задача 1: недопустимое значение поля «status»');
    expect(() => validateDb({ ...db, tasks: [task({ deadline: '9 окт' })] })).toThrow('ГГГГ-ММ-ДД');
    expect(() => validateDb({ ...db, tasks: [task({ checklist: [{ id: 'c1', text: '', done: false }] })] })).toThrow('пункт 1');
    expect(() => validateDb({ ...db, tasks: [task(), task()] })).toThrow('повторяется id');
  });
});

describe('проекты', () => {
  const base = () => migrate(v1Data, makeCtx());
  const project = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    title: 'IELTS',
    description: '',
    areaId: null,
    goalId: 'g1',
    status: 'active',
    deadline: null,
    milestones: [{ id: 'm1', title: 'Диагностика', deadline: '2026-10-10' }],
    completedAt: null,
    createdAt: 'x',
    ...overrides,
  });
  const task = (overrides: Record<string, unknown> = {}) => ({
    id: 't1', title: 'Пробный тест', notes: '', status: 'todo', important: false, deadline: null, plannedDate: null,
    areaId: null, projectId: 'p1', milestoneId: 'm1', checklist: [], completedAt: null, createdAt: 'x', ...overrides,
  });

  it('проходят проверку без изменений', () => {
    const db = { ...base(), projects: [project()], tasks: [task()] };
    expect(validateDb(db)).toEqual(db);
  });

  it('чинят висячие ссылки: цель, проект задачи и веха', () => {
    const db = base();
    expect(validateDb({ ...db, projects: [project({ goalId: 'нет' })] }).projects[0].goalId).toBeNull();
    const fixed = validateDb({
      ...db,
      projects: [project()],
      tasks: [task({ id: 'a', projectId: 'нет' }), task({ id: 'b', milestoneId: 'нет' }), task({ id: 'c', projectId: null })],
    });
    expect(fixed.tasks.map((t) => [t.projectId, t.milestoneId])).toEqual([
      [null, null],
      ['p1', null],
      [null, null],
    ]);
  });

  it('отклоняют ошибки', () => {
    const db = base();
    expect(() => validateDb({ ...db, projects: [project({ status: 'someday' })] })).toThrow('Проект 1: недопустимое значение поля «status»');
    expect(() => validateDb({ ...db, projects: [project({ milestones: [{ id: 'm1', title: '', deadline: null }] })] })).toThrow('веха 1');
    expect(() => validateDb({ ...db, projects: [project(), project()] })).toThrow('повторяется id');
  });
});

describe('резервная копия', () => {
  it('экспорт и импорт возвращают те же данные', () => {
    const db = migrate(v1Data, makeCtx());
    const text = JSON.stringify(toBackup(db, '2026-09-29T12:00:00.000Z'));
    expect(parseBackup(text, makeCtx())).toEqual(db);
  });

  it('не принимает чужие файлы', () => {
    expect(() => parseBackup('not json', makeCtx())).toThrow(DataError);
    expect(() => parseBackup('{"goals": []}', makeCtx())).toThrow('не резервная копия');
  });

  it('пустая база содержит сферы по умолчанию', () => {
    const db = createEmptyDb(makeCtx());
    expect(db.areas).toHaveLength(4);
    expect(db.areas.map((a) => a.order)).toEqual([0, 1, 2, 3]);
    expect(db.notes).toEqual([]);
    expect(validateDb(db)).toEqual(db);
  });
});

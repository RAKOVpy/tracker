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

describe('migrate', () => {
  it('v1 → v2: категории превращаются в сферы, «другое» остаётся без сферы', () => {
    const db = migrate(v1Data, makeCtx());
    expect(db.areas.map((a) => a.name)).toEqual(['Чтение', 'Языки', 'Спорт', 'Учёба']);
    const [reading, languages] = db.areas;
    expect(db.goals.map((g) => g.areaId)).toEqual([reading.id, null, languages.id]);
    expect(db.goals[0]).not.toHaveProperty('category');
    expect(db.entries).toHaveLength(1);
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
    expect(() => validateDb({ ...db, goals: [db.goals[0], db.goals[0]] })).toThrow('повторяется id');
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
    expect(validateDb(db)).toEqual(db);
  });
});

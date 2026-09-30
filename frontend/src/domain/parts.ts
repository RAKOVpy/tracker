import { compareTasks } from './tasks';
import type { Material, MaterialPart, MaterialType, PartStatus, Task } from './types';

/**
 * Части материала: главы, лекции, уроки. Статус части ставится вручную (не начата → прочитана),
 * а законспектированной она считается и тогда, когда сделана её задача-конспект:
 * вернули задачу в работу — часть снова в прежнем статусе, ничего не нужно откатывать руками.
 */

export const PART_STATUS_ORDER: PartStatus[] = ['todo', 'studied', 'summarized'];

/** Как назвать изученную часть: книгу читают, лекцию смотрят, курс проходят. */
const STUDIED: Record<MaterialType, string> = {
  book: 'прочитана',
  article: 'прочитана',
  lecture: 'просмотрена',
  video: 'просмотрена',
  course: 'пройдена',
  other: 'изучена',
};

export function partStatusLabel(status: PartStatus, type: MaterialType): string {
  if (status === 'todo') return 'не начата';
  return status === 'studied' ? STUDIED[type] : 'законспектирована';
}

/** Как обычно называются части: у книги — главы, у курса — уроки. */
export const PART_PREFIX: Record<MaterialType, string> = {
  book: 'Глава',
  article: 'Раздел',
  lecture: 'Лекция',
  video: 'Часть',
  course: 'Урок',
  other: 'Часть',
};

export interface PartState {
  part: MaterialPart;
  /** С учётом сделанного конспекта. */
  status: PartStatus;
  /** Законспектирована, потому что сделана задача-конспект. */
  byTask: boolean;
  /** Ближайшая открытая задача по части. */
  task: Task | null;
}

/** Задачи материала, сгруппированные по частям. */
function tasksByPart(material: Material, tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.materialId !== material.id || task.partId === null) continue;
    const list = map.get(task.partId);
    if (list) list.push(task);
    else map.set(task.partId, [task]);
  }
  return map;
}

export function partStates(material: Material, tasks: Task[], today: string): PartState[] {
  const byPart = tasksByPart(material, tasks);
  return material.parts.map((part) => {
    const linked = byPart.get(part.id) ?? [];
    const byTask = linked.some((t) => t.status === 'done');
    const open = linked.filter((t) => t.status === 'todo' || t.status === 'inbox').sort((a, b) => compareTasks(a, b, today));
    return { part, status: byTask ? 'summarized' : part.status, byTask, task: open[0] ?? null };
  });
}

export interface PartsProgress {
  total: number;
  summarized: number;
  /** Прочитаны, но ещё не законспектированы. */
  studied: number;
}

export function partsProgress(states: PartState[]): PartsProgress {
  return {
    total: states.length,
    summarized: states.filter((s) => s.status === 'summarized').length,
    studied: states.filter((s) => s.status === 'studied').length,
  };
}

/** Следующая часть — первая незаконспектированная по порядку. */
export function nextPart(states: PartState[]): PartState | null {
  return states.find((s) => s.status !== 'summarized') ?? null;
}

/** «Глава 4» … «Глава 12»: нумерация продолжает уже добавленные части с тем же названием. */
export function numberedParts(existing: MaterialPart[], prefix: string, count: number, newId: () => string): MaterialPart[] {
  const name = prefix.trim();
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`, 'i');
  const last = existing.reduce((max, part) => {
    const match = pattern.exec(part.title.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return Array.from({ length: count }, (_, i) => ({ id: newId(), title: `${name} ${last + i + 1}`, status: 'todo' }));
}

/** Название задачи-конспекта. */
export function summaryTaskTitle(part: MaterialPart): string {
  return `Законспектировать: ${part.title}`;
}

/** Части, которые убрали из материала, снимаются с задач; задачи остаются у материала. */
export function detachRemovedParts(tasks: Task[], material: Material): Task[] {
  const ids = new Set(material.parts.map((p) => p.id));
  return tasks.map((t) => (t.materialId === material.id && t.partId !== null && !ids.has(t.partId) ? { ...t, partId: null } : t));
}

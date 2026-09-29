import type { IsoDate } from '../lib/dates';

export type Priority = 'low' | 'medium' | 'high';

/** active — в работе; archived — скрыта пользователем (брошена или больше не актуальна). */
export type GoalStatus = 'active' | 'archived';

export type AreaColor = 'clay' | 'ochre' | 'sage' | 'teal' | 'slate' | 'plum' | 'rose' | 'stone';

export type AreaIcon =
  | 'book'
  | 'languages'
  | 'dumbbell'
  | 'study'
  | 'work'
  | 'health'
  | 'code'
  | 'music'
  | 'money'
  | 'home'
  | 'travel'
  | 'star';

/** Сфера жизни: «Чтение», «Английский», «Спорт». Цели (а позже задачи и материалы) относятся к сфере. */
export interface Area {
  id: string;
  name: string;
  color: AreaColor;
  icon: AreaIcon;
  order: number;
  createdAt: string;
}

/**
 * Измеримая цель: «прочитать 320 страниц к 31 октября».
 * Достигнута ли цель — не хранится, а вычисляется из записей прогресса.
 */
export interface Goal {
  id: string;
  title: string;
  description: string;
  /** null — цель без сферы. */
  areaId: string | null;
  /** Единица измерения в свободной форме: «стр.», «минут», «км», «тренировок». */
  unit: string;
  targetValue: number;
  startDate: IsoDate;
  deadline: IsoDate;
  priority: Priority;
  status: GoalStatus;
  createdAt: string;
}

/** Запись прогресса: «12 октября прочитал 25 страниц». В один день записей может быть несколько. */
export interface ProgressEntry {
  id: string;
  goalId: string;
  date: IsoDate;
  value: number;
  note: string;
  createdAt: string;
}

// ---------- знания ----------

export type MaterialType = 'book' | 'course' | 'lecture' | 'article' | 'video' | 'other';

/** queued — «хочу изучить», active — изучаю сейчас, done — изучено, dropped — бросил. */
export type MaterialStatus = 'queued' | 'active' | 'done' | 'dropped';

/** Источник знаний: книга, курс, лекция. Заметки обычно относятся к материалу. */
export interface Material {
  id: string;
  title: string;
  type: MaterialType;
  author: string;
  url: string;
  areaId: string | null;
  status: MaterialStatus;
  createdAt: string;
}

/**
 * Заметка для повторения: тема, которую нужно помнить.
 * Уровень освоения и дата следующего повторения не хранятся, а вычисляются из журнала повторений.
 */
export interface Note {
  id: string;
  title: string;
  materialId: string | null;
  /** Вопросы для самопроверки. */
  questions: string[];
  /** Ключевые мысли — с ними сверяешься после того, как вспомнил сам. */
  summary: string;
  /** Ссылка вида obsidian://open?vault=…&file=… или пустая строка. */
  obsidianUri: string;
  /** paused — повторения приостановлены, заметка не попадает в сессии. */
  status: 'active' | 'paused';
  /** Дата добавления: первое повторение — на следующий день. */
  addedOn: IsoDate;
  createdAt: string;
}

/** Как вспомнилось: забыл / с трудом / хорошо / легко. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Самооценка «Смог бы объяснить другому?». */
export type ExplainAnswer = 'no' | 'hints' | 'yes';

export type MasteryLevel = 1 | 2 | 3 | 4 | 5;

/** Одно повторение заметки. Весь журнал хранится, чтобы расписание можно было пересчитать. */
export interface Review {
  id: string;
  noteId: string;
  date: IsoDate;
  rating: Rating;
  /** null — самооценку пропустили. */
  explain: ExplainAnswer | null;
  /** Объяснил тему другому человеку на деле. */
  taught: boolean;
  createdAt: string;
}

export type MaterialInput = Omit<Material, 'id' | 'createdAt'>;
export type MaterialPatch = Partial<MaterialInput>;
export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'status' | 'addedOn'>;
export type NotePatch = Partial<NoteInput & Pick<Note, 'status'>>;
export type ReviewInput = Omit<Review, 'id' | 'createdAt'>;

export type AreaInput = Pick<Area, 'name' | 'color' | 'icon'>;
export type AreaPatch = Partial<AreaInput & Pick<Area, 'order'>>;
export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'status'>;
export type GoalPatch = Partial<GoalInput & Pick<Goal, 'status'>>;
export type EntryInput = Omit<ProgressEntry, 'id' | 'createdAt'>;

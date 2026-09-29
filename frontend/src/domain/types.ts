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

export type AreaInput = Pick<Area, 'name' | 'color' | 'icon'>;
export type AreaPatch = Partial<AreaInput & Pick<Area, 'order'>>;
export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'status'>;
export type GoalPatch = Partial<GoalInput & Pick<Goal, 'status'>>;
export type EntryInput = Omit<ProgressEntry, 'id' | 'createdAt'>;

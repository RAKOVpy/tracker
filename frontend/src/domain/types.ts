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

/** target — цель к сроку: «480 страниц к 19 октября»; habit — привычка: «английский 20 минут каждый день». */
export type GoalKind = 'target' | 'habit';

interface GoalBase {
  id: string;
  title: string;
  description: string;
  /** null — цель без сферы. */
  areaId: string | null;
  /** Единица измерения в свободной форме: «стр.», «минут», «км», «раз». */
  unit: string;
  /** У цели — сколько всего к сроку; у привычки — сколько за день (одна отметка записывает столько). */
  targetValue: number;
  /** У цели — день старта; у привычки — с какого дня она считается. */
  startDate: IsoDate;
  priority: Priority;
  status: GoalStatus;
  createdAt: string;
}

/**
 * Измеримая цель: «прочитать 320 страниц к 31 октября».
 * Достигнута ли цель — не хранится, а вычисляется из записей прогресса.
 */
export interface TargetGoal extends GoalBase {
  kind: 'target';
  deadline: IsoDate;
  daysPerWeek: null;
}

/**
 * Привычка: «английский 20 минут каждый день», «зал 3 раза в неделю». Срока нет; выполнение за неделю
 * и серия вычисляются из записей прогресса (см. domain/habits.ts).
 */
export interface HabitGoal extends GoalBase {
  kind: 'habit';
  deadline: null;
  /** Сколько дней в неделю: 7 — каждый день, 3 — «3 раза в неделю» в любые дни. */
  daysPerWeek: number;
}

export type Goal = TargetGoal | HabitGoal;

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

/** Часть материала: todo — не начата; studied — прочитана (просмотрена, пройдена); summarized — законспектирована. */
export type PartStatus = 'todo' | 'studied' | 'summarized';

/**
 * Часть материала: глава, лекция, урок. Конспект части — задача, связанная с частью:
 * когда она сделана, часть считается законспектированной (см. domain/parts.ts).
 */
export interface MaterialPart {
  id: string;
  title: string;
  /** Отметка вручную. */
  status: PartStatus;
}

/** Источник знаний: книга, курс, лекция. Заметки обычно относятся к материалу. */
export interface Material {
  id: string;
  title: string;
  type: MaterialType;
  author: string;
  url: string;
  areaId: string | null;
  status: MaterialStatus;
  /** Части по порядку; ведутся в трекере, синхронизация с Obsidian их не трогает. */
  parts: MaterialPart[];
  /** Путь к странице материала в хранилище Obsidian; null — создан в трекере. */
  obsidianPath: string | null;
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
  /**
   * Путь к файлу в хранилище Obsidian, например «Заметки/Двоичный поиск.md».
   * Такие заметки обновляются при синхронизации; null — заметка создана в трекере.
   */
  obsidianPath: string | null;
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

// ---------- нагрузка ----------

/** Мягкие лимиты: сколько повторять в день и сколько изучать одновременно. */
export interface Settings {
  /** Дневной бюджет повторений в заметках. Остальные заметки переносятся на следующие дни. */
  dailyReviewLimit: number;
  /** Сколько материалов можно изучать одновременно; остальные ждут в «Хочу изучить». */
  activeMaterialsLimit: number;
  /** Сколько новых заметок из Obsidian вводить в повторение за день. */
  newNotesPerDay: number;
  /** Строгий режим: при превышении лимита или долге повторений новый материал начать нельзя. */
  strictMode: boolean;
}

/**
 * Отпуск: повторения на паузе, дни отпуска не считаются в расписании, серии не прерываются.
 * Прошедшие отпуска хранятся: расписание вычисляется из них заново.
 */
export interface Vacation {
  id: string;
  start: IsoDate;
  /** Последний день отпуска включительно; null — пока не выключу. */
  end: IsoDate | null;
  createdAt: string;
}

// ---------- задачи ----------

/** inbox — записано во «Входящие» и ещё не разобрано; todo — задача; done — сделана; cancelled — не буду делать. */
export type TaskStatus = 'inbox' | 'todo' | 'done' | 'cancelled';

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/**
 * Повтор задачи: «каждое вс», «каждые 2 недели по пн и чт», «каждый месяц 10-го».
 * Когда задачу закрывают, появляется следующая — с датами на следующий повтор (см. domain/recurrence.ts).
 */
export interface Recurrence {
  unit: RepeatUnit;
  /** Каждые сколько единиц: 1 — каждый день (неделю, месяц), 2 — через один. */
  interval: number;
  /** Дни недели для недельного повтора, 0 — пн … 6 — вс; у остальных единиц — пусто. */
  weekdays: number[];
  /** Начало отсчёта: от него считаются недели «через одну», число месяца и день года. */
  start: IsoDate;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * Задача. «Входящие» — это задачи со статусом inbox, отдельной сущности нет.
 * Срочность не хранится: она вычисляется из дедлайна (см. domain/tasks.ts).
 */
export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  /** Важность ставится вручную: важно / обычно. */
  important: boolean;
  /** Дедлайн: «сдать до пятницы». */
  deadline: IsoDate | null;
  /** Когда делаю: «сяду в среду». Не путать с дедлайном. */
  plannedDate: IsoDate | null;
  areaId: string | null;
  /** Проект, к которому относится задача, и его веха. Веха бывает только у задачи проекта. */
  projectId: string | null;
  milestoneId: string | null;
  /** Материал и его часть: «Законспектировать главу 5». Часть бывает только вместе с материалом. */
  materialId: string | null;
  partId: string | null;
  /** Подзадачи — чек-лист. */
  checklist: ChecklistItem[];
  /** Повтор; null — задача разовая. */
  recurrence: Recurrence | null;
  /** Из какой задачи появился этот повтор; null — не повтор. */
  repeatOf: string | null;
  /** Когда задачу сделали или отменили. */
  completedAt: string | null;
  createdAt: string;
}

export type TaskInput = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'status'
  | 'important'
  | 'deadline'
  | 'plannedDate'
  | 'areaId'
  | 'projectId'
  | 'milestoneId'
  | 'materialId'
  | 'partId'
  | 'checklist'
  | 'recurrence'
>;
export type TaskPatch = Partial<TaskInput>;

// ---------- проекты ----------

/** active — в работе; paused — на паузе; done — завершён; dropped — отменён. */
export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped';

/** Веха — этап проекта: «Диагностика до 10 окт». Сделана, когда сделаны все её задачи. */
export interface Milestone {
  id: string;
  title: string;
  deadline: IsoDate | null;
}

/**
 * Проект — набор задач с вехами: «Подготовиться к IELTS». Можно связать с измеримой целью
 * («Набрать 7.0»). Прогресс и следующий шаг не хранятся, а вычисляются из задач.
 */
export interface Project {
  id: string;
  title: string;
  description: string;
  areaId: string | null;
  goalId: string | null;
  status: ProjectStatus;
  deadline: IsoDate | null;
  /** Вехи по порядку. */
  milestones: Milestone[];
  /** Когда проект завершили или отменили. */
  completedAt: string | null;
  createdAt: string;
}

export type ProjectInput = Pick<Project, 'title' | 'description' | 'areaId' | 'goalId' | 'status' | 'deadline' | 'milestones'>;
export type ProjectPatch = Partial<ProjectInput>;

// ---------- обзор недели ----------

/**
 * Обзор недели: итоги недели и фокус на следующую. `weekStart` — понедельник недели, которую подводили;
 * фокус относится к неделе после неё.
 */
export interface WeeklyReview {
  id: string;
  weekStart: IsoDate;
  /** До трёх главных дел на следующую неделю; их можно отмечать сделанными. */
  focus: ChecklistItem[];
  /** «Что получилось, что мешало». */
  reflection: string;
  createdAt: string;
}

export type WeeklyReviewInput = Pick<WeeklyReview, 'weekStart' | 'focus' | 'reflection'>;
export type WeeklyReviewPatch = Partial<Pick<WeeklyReview, 'focus' | 'reflection'>>;

export type SettingsPatch = Partial<Settings>;
export type VacationInput = Pick<Vacation, 'start' | 'end'>;

export type MaterialInput = Omit<Material, 'id' | 'createdAt' | 'obsidianPath'>;
export type MaterialPatch = Partial<MaterialInput>;
export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'status' | 'addedOn' | 'obsidianPath'>;
export type NotePatch = Partial<NoteInput & Pick<Note, 'status'>>;
export type ReviewInput = Omit<Review, 'id' | 'createdAt'>;

export type AreaInput = Pick<Area, 'name' | 'color' | 'icon'>;
export type AreaPatch = Partial<AreaInput & Pick<Area, 'order'>>;
/** Omit по каждому варианту объединения: обычный Omit склеил бы цель и привычку в одно. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type GoalInput = OmitEach<Goal, 'id' | 'createdAt' | 'status'>;
/** Вид цели после создания не меняется; поля другого вида игнорируются (см. applyGoalPatch). */
export type GoalPatch = Partial<Omit<GoalBase, 'id' | 'createdAt'> & { deadline: IsoDate | null; daysPerWeek: number | null }>;
export type EntryInput = Omit<ProgressEntry, 'id' | 'createdAt'>;

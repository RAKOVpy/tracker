import type { AreaColor, AreaIcon, AreaInput, Priority } from './types';

export const AREA_COLORS: AreaColor[] = ['clay', 'ochre', 'sage', 'teal', 'slate', 'plum', 'rose', 'stone'];

export const AREA_ICONS: AreaIcon[] = [
  'book',
  'languages',
  'dumbbell',
  'study',
  'work',
  'health',
  'code',
  'music',
  'money',
  'home',
  'travel',
  'star',
];

/** Сферы, которые создаются при первом запуске. */
export const DEFAULT_AREAS: AreaInput[] = [
  { name: 'Чтение', color: 'ochre', icon: 'book' },
  { name: 'Языки', color: 'slate', icon: 'languages' },
  { name: 'Спорт', color: 'sage', icon: 'dumbbell' },
  { name: 'Учёба', color: 'clay', icon: 'study' },
];

export const UNIT_SUGGESTIONS = [
  'стр.',
  'глав',
  'книг',
  'минут',
  'часов',
  'уроков',
  'слов',
  'тренировок',
  'км',
  'повторений',
  'задач',
  'раз',
];

/**
 * Формы для склонения известных единиц: «1 час», «2 часа», «5 часов».
 * Единица хранится в форме «много» (как в подсказках), сокращения вроде «стр.» и «км» не склоняются.
 */
export const UNIT_FORMS: Record<string, [one: string, few: string, many: string]> = {
  страниц: ['страница', 'страницы', 'страниц'],
  глав: ['глава', 'главы', 'глав'],
  книг: ['книга', 'книги', 'книг'],
  минут: ['минута', 'минуты', 'минут'],
  часов: ['час', 'часа', 'часов'],
  уроков: ['урок', 'урока', 'уроков'],
  слов: ['слово', 'слова', 'слов'],
  тренировок: ['тренировка', 'тренировки', 'тренировок'],
  повторений: ['повторение', 'повторения', 'повторений'],
  задач: ['задача', 'задачи', 'задач'],
  раз: ['раз', 'раза', 'раз'],
};

export const PRIORITIES: Record<Priority, { label: string; rank: number }> = {
  high: { label: 'Высокий', rank: 0 },
  medium: { label: 'Средний', rank: 1 },
  low: { label: 'Низкий', rank: 2 },
};

export const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low'];

/** Порог, после которого цель считается долгосрочной. */
export const LONG_TERM_DAYS = 30;

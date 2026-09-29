import type { Category, Priority } from './types';

export const CATEGORIES: Record<Category, { label: string; icon: string; units: string[] }> = {
  reading: { label: 'Чтение', icon: '📚', units: ['стр.', 'глав', 'книг', 'минут'] },
  language: { label: 'Языки', icon: '🗣️', units: ['минут', 'уроков', 'слов', 'часов'] },
  sport: { label: 'Спорт', icon: '🏃', units: ['тренировок', 'км', 'минут', 'повторений'] },
  study: { label: 'Учёба', icon: '🎓', units: ['уроков', 'часов', 'задач', 'минут'] },
  other: { label: 'Другое', icon: '⭐', units: ['раз', 'часов', 'минут', 'шт.'] },
};

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

export const CATEGORY_ORDER: Category[] = ['reading', 'language', 'sport', 'study', 'other'];

export const PRIORITIES: Record<Priority, { label: string; rank: number }> = {
  high: { label: 'Высокий', rank: 0 },
  medium: { label: 'Средний', rank: 1 },
  low: { label: 'Низкий', rank: 2 },
};

export const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low'];

/** Порог, после которого цель считается долгосрочной. */
export const LONG_TERM_DAYS = 30;

import { addDays, todayIso } from '../lib/dates';
import { api } from '.';

/** Пример целей с историей прогресса, чтобы сразу увидеть, как выглядит приложение. */
export async function seedDemoData(): Promise<void> {
  const today = todayIso();

  const book = await api.createGoal({
    title: 'Прочитать «Атлант расправил плечи»',
    description: 'Том 1. Читать перед сном хотя бы полчаса.',
    category: 'reading',
    unit: 'стр.',
    targetValue: 480,
    startDate: addDays(today, -9),
    deadline: addDays(today, 20),
    priority: 'high',
  });
  const bookLog = [18, 22, 0, 15, 20, 0, 0, 25, 12];
  for (const [i, value] of bookLog.entries()) {
    if (value > 0) {
      await api.createEntry({ goalId: book.id, date: addDays(today, -9 + i), value, note: '' });
    }
  }

  const english = await api.createGoal({
    title: 'Английский: 30 часов разговорной практики',
    description: 'Созвоны с преподавателем + подкасты.',
    category: 'language',
    unit: 'часов',
    targetValue: 30,
    startDate: addDays(today, -14),
    deadline: addDays(today, 75),
    priority: 'medium',
  });
  const englishLog = [1, 0.5, 0, 1, 1, 0.5, 0, 1, 0.5, 1, 0, 1, 0.5, 1];
  for (const [i, value] of englishLog.entries()) {
    if (value > 0) {
      await api.createEntry({ goalId: english.id, date: addDays(today, -14 + i), value, note: '' });
    }
  }

  const sport = await api.createGoal({
    title: '12 тренировок в зале за месяц',
    description: '',
    category: 'sport',
    unit: 'тренировок',
    targetValue: 12,
    startDate: addDays(today, -6),
    deadline: addDays(today, 23),
    priority: 'medium',
  });
  for (const offset of [-6, -4, -2, 0]) {
    await api.createEntry({ goalId: sport.id, date: addDays(today, offset), value: 1, note: '' });
  }
}

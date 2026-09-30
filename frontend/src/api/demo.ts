import type { AreaInput, ExplainAnswer, NoteInput, Rating, TaskInput } from '../domain/types';
import { taskInput } from '../domain/tasks';
import { addDays, todayIso } from '../lib/dates';
import { api } from '.';

/** Сферы ищем по иконке: пользователь мог их переименовать. Если сферы нет — создаём. */
async function findOrCreateArea(input: AreaInput): Promise<string> {
  const existing = (await api.listAreas()).find((a) => a.icon === input.icon);
  return existing ? existing.id : (await api.createArea(input)).id;
}

/** Пример целей с историей прогресса, чтобы сразу увидеть, как выглядит приложение. */
export async function seedDemoData(): Promise<void> {
  const today = todayIso();
  const areaId = findOrCreateArea;

  const book = await api.createGoal({
    title: 'Прочитать «Атлант расправил плечи»',
    description: 'Том 1. Читать перед сном хотя бы полчаса.',
    areaId: await areaId({ name: 'Чтение', color: 'ochre', icon: 'book' }),
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
    areaId: await areaId({ name: 'Языки', color: 'slate', icon: 'languages' }),
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
    areaId: await areaId({ name: 'Спорт', color: 'sage', icon: 'dumbbell' }),
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

type LogItem = [dayOffset: number, rating: Rating, explain?: ExplainAnswer, taught?: boolean];

/** Пример для пустого трекера: цели, а если знаний, задач и проектов ещё нет — и они. */
export async function seedAllDemo(): Promise<void> {
  await seedDemoData();
  const [materials, notes, tasks, projects] = await Promise.all([api.listMaterials(), api.listNotes(), api.listTasks(), api.listProjects()]);
  if (materials.length === 0 && notes.length === 0) await seedKnowledgeDemo();
  if (tasks.length === 0 && projects.length === 0) await seedTasksDemo();
}

/**
 * Пример задач и проектов: задача на сегодня, перенесённая со вчера, срочная, на неделе, без даты,
 * сделанная, «Входящие» и два проекта с вехами — один связан с целью по английскому.
 */
export async function seedTasksDemo(): Promise<void> {
  const today = todayIso();
  const study = await findOrCreateArea({ name: 'Учёба', color: 'clay', icon: 'study' });
  const languages = await findOrCreateArea({ name: 'Языки', color: 'slate', icon: 'languages' });
  const englishGoal = (await api.listGoals()).find((g) => g.areaId === languages && g.status === 'active');
  const milestone = (title: string, deadline: string | null = null) => ({ id: crypto.randomUUID(), title, deadline });
  const item = (text: string, done = false) => ({ id: crypto.randomUUID(), text, done });

  const [material, slides, rehearsal] = [milestone('Материал', addDays(today, 2)), milestone('Слайды', addDays(today, 5)), milestone('Репетиция', addDays(today, 6))];
  const seminar = await api.createProject({
    title: 'Выступить на семинаре по алгоритмам',
    description: 'Доклад про обход графов: 10 минут и вопросы.',
    areaId: study,
    goalId: null,
    status: 'active',
    deadline: addDays(today, 7),
    milestones: [material, slides, rehearsal],
  });
  const [diagnostics, writing, speaking] = [milestone('Диагностика'), milestone('Writing', addDays(today, 30)), milestone('Speaking', addDays(today, 60))];
  const ielts = await api.createProject({
    title: 'Подготовиться к IELTS',
    description: '',
    areaId: languages,
    goalId: englishGoal?.id ?? null,
    status: 'active',
    deadline: addDays(today, 75),
    milestones: [diagnostics, writing, speaking],
  });
  const inSeminar = { projectId: seminar.id, areaId: study };
  const inIelts = { projectId: ielts.id, areaId: languages };

  const tasks: TaskInput[] = [
    taskInput({
      ...inSeminar,
      milestoneId: material.id,
      title: 'Законспектировать лекцию 5 по алгоритмам',
      important: true,
      plannedDate: today,
      deadline: addDays(today, 2),
      checklist: [item('Пересмотреть запись', true), item('Выписать определения'), item('Сделать 3 заметки с вопросами')],
    }),
    taskInput({
      ...inSeminar,
      milestoneId: slides.id,
      title: 'Подготовить презентацию к семинару',
      important: true,
      plannedDate: addDays(today, 3),
      deadline: addDays(today, 5),
      notes: '10 минут, 8–10 слайдов. Показать пример с графами.',
    }),
    taskInput({ ...inSeminar, milestoneId: rehearsal.id, title: 'Прогнать выступление перед другом' }),
    taskInput({ ...inIelts, milestoneId: diagnostics.id, title: 'Пройти пробный тест', status: 'done' }),
    taskInput({ ...inIelts, milestoneId: writing.id, title: 'Написать эссе Task 2 и проверить по критериям', plannedDate: addDays(today, 2) }),
    taskInput({ ...inIelts, milestoneId: writing.id, title: 'Выучить 20 связок для эссе' }),
    taskInput({ title: 'Ответить на письмо куратора', plannedDate: addDays(today, -1) }),
    taskInput({ title: 'Оплатить интернет', deadline: addDays(today, 1) }),
    taskInput({ title: 'Разобрать фотографии с отпуска' }),
    taskInput({ title: 'Записаться к стоматологу', plannedDate: today, status: 'done' }),
    taskInput({ title: 'Позвонить в банк про карту', status: 'inbox' }),
    taskInput({ title: 'Курс по SQL на Stepik', status: 'inbox' }),
    taskInput({ title: 'Переехать в новую квартиру', status: 'inbox' }),
  ];
  for (const task of tasks) await api.createTask(task);
}

/** Пример материалов и заметок с историей повторений: часть заметок ждёт повторения сегодня. */
export async function seedKnowledgeDemo(): Promise<void> {
  const today = todayIso();
  // Пример не должен сразу нарушать лимит «Изучаю» из настроек.
  const { activeMaterialsLimit } = await api.getSettings();

  const algorithms = await api.createMaterial({
    title: 'Алгоритмы и структуры данных',
    type: 'course',
    author: '',
    url: '',
    areaId: await findOrCreateArea({ name: 'Учёба', color: 'clay', icon: 'study' }),
    status: 'active',
  });
  const grammar = await api.createMaterial({
    title: 'English Grammar in Use',
    type: 'book',
    author: 'Raymond Murphy',
    url: '',
    areaId: await findOrCreateArea({ name: 'Языки', color: 'slate', icon: 'languages' }),
    status: activeMaterialsLimit >= 2 ? 'active' : 'queued',
  });
  await api.createMaterial({
    title: 'Думай медленно… решай быстро',
    type: 'book',
    author: 'Даниэль Канеман',
    url: '',
    areaId: await findOrCreateArea({ name: 'Чтение', color: 'ochre', icon: 'book' }),
    status: 'queued',
  });

  async function note(input: NoteInput, addedOffset: number, log: LogItem[]) {
    const created = await api.createNote(input, { addedOn: addDays(today, addedOffset) });
    for (const [offset, rating, explain = null, taught = false] of log) {
      await api.createReview({ noteId: created.id, date: addDays(today, offset), rating, explain, taught });
    }
  }

  await note(
    {
      title: 'Графы: обход в ширину и в глубину',
      materialId: algorithms.id,
      questions: [
        'Чем обход в ширину (BFS) отличается от обхода в глубину (DFS)?',
        'Какой обход находит кратчайший путь в невзвешенном графе и почему?',
        'Какая сложность у BFS и DFS?',
      ],
      summary:
        'BFS обходит граф слоями с помощью очереди: сначала все соседи, потом соседи соседей.\n' +
        'Поэтому BFS находит кратчайший путь по числу рёбер в невзвешенном графе.\n' +
        'DFS уходит вглубь по одной ветке через стек или рекурсию — удобен для поиска циклов и топологической сортировки.\n' +
        'Сложность обоих — O(V + E).',
      obsidianUri: '',
    },
    -12,
    [
      [-11, 'good'],
      [-10, 'good'],
      [-7, 'good'],
    ],
  );

  await note(
    {
      title: 'Хеш-таблицы и коллизии',
      materialId: algorithms.id,
      questions: [
        'Как хеш-таблица находит элемент в среднем за O(1)?',
        'Что такое коллизия и как их разрешают?',
        'Зачем таблицу расширяют при большом заполнении?',
      ],
      summary:
        'Хеш-функция превращает ключ в номер ячейки массива, поэтому поиск не перебирает все элементы.\n' +
        'Коллизия — два ключа попали в одну ячейку. Решения: цепочки (список в ячейке) и открытая адресация.\n' +
        'Когда таблица заполнена больше чем на ~75%, коллизий много, поэтому массив увеличивают и перераспределяют ключи.',
      obsidianUri: '',
    },
    -3,
    [[-2, 'good']],
  );

  await note(
    {
      title: 'Двоичный поиск',
      materialId: algorithms.id,
      questions: ['Какое условие обязательно для двоичного поиска?', 'Почему сложность O(log n)?', 'Какая типичная ошибка в реализации?'],
      summary:
        'Массив должен быть отсортирован.\n' +
        'На каждом шаге сравниваем с серединой и отбрасываем половину, поэтому шагов около log₂ n.\n' +
        'Типичная ошибка — бесконечный цикл из-за неверного сдвига границ.',
      obsidianUri: '',
    },
    -6,
    [
      [-5, 'good'],
      [-4, 'hard'],
      [-3, 'good'],
    ],
  );

  await note(
    {
      title: 'Present Perfect и Past Simple',
      materialId: grammar.id,
      questions: [
        'Когда нужен Present Perfect, а когда Past Simple?',
        'Почему нельзя сказать «I have seen him yesterday»?',
        'Какие слова подсказывают Present Perfect?',
      ],
      summary:
        'Present Perfect связывает прошлое с настоящим: важен результат или опыт, а не время (I have lost my keys).\n' +
        'Past Simple — законченное действие в конкретный момент прошлого (I lost my keys yesterday).\n' +
        'С точным временем в прошлом (yesterday, in 2020) Present Perfect не используется.\n' +
        'Подсказки: already, yet, just, ever, never, since, for.',
      obsidianUri: '',
    },
    -20,
    [
      [-19, 'good'],
      [-18, 'good'],
      [-15, 'good', 'yes'],
      [-8, 'easy', 'yes'],
    ],
  );

  await note(
    {
      title: 'Модальные глаголы: can, could, be able to',
      materialId: grammar.id,
      questions: [
        'Чем can отличается от be able to?',
        'Как сказать о способности в будущем?',
        'Когда could, а когда was able to?',
      ],
      summary:
        'can — способность сейчас. У can нет будущего времени, поэтому там be able to (I will be able to swim).\n' +
        'could — общая способность в прошлом (I could swim when I was five).\n' +
        'was able to — удалось сделать в конкретной ситуации (I was able to catch the train).',
      obsidianUri: '',
    },
    -1,
    [],
  );
}

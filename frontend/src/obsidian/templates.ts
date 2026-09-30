import materialTemplate from '../../../obsidian/templates/Материал.md?raw';
import studyNotesTemplate from '../../../obsidian/templates/Конспект.md?raw';
import noteTemplate from '../../../obsidian/templates/Заметка.md?raw';

/** Шаблоны для Obsidian — те же файлы, что лежат в obsidian/templates в репозитории. */
export const OBSIDIAN_TEMPLATES = [
  {
    file: 'Материал.md',
    title: 'Материал',
    description: 'Страница книги, курса или лекции. Трекер создаст по ней материал.',
    content: materialTemplate,
  },
  {
    file: 'Конспект.md',
    title: 'Конспект',
    description: 'Черновик во время чтения или лекции. Трекер его не читает.',
    content: studyNotesTemplate,
  },
  {
    file: 'Заметка.md',
    title: 'Заметка',
    description: 'Одна мысль для повторения: суть, пример и вопросы. Попадает в трекер.',
    content: noteTemplate,
  },
];

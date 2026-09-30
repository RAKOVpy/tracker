import { BookOpen, FolderKanban, ListTodo, NotebookPen, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

const OPTIONS = [
  {
    to: '/tasks/new',
    icon: ListTodo,
    title: 'Задача',
    text: 'Дело со сроком или днём, когда за него сесть: «законспектировать лекцию 5 до пятницы».',
  },
  {
    to: '/projects/new',
    icon: FolderKanban,
    title: 'Проект',
    text: 'Дело из нескольких шагов: «подготовиться к IELTS» — с вехами, задачами и связью с целью.',
  },
  {
    to: '/goals/new',
    icon: Target,
    title: 'Цель',
    text: 'Измеримая цель со сроком: «прочитать 480 страниц к 19 октября».',
  },
  {
    to: '/knowledge/notes/new',
    icon: NotebookPen,
    title: 'Заметка',
    text: 'Тема, которую нужно помнить: вопросы для самопроверки и ключевые мысли.',
  },
  {
    to: '/knowledge/materials/new',
    icon: BookOpen,
    title: 'Материал',
    text: 'Книга, курс или лекция, из которых появляются заметки.',
  },
];

/** Выбор, что создать подробно. Быстро записать можно кнопкой «Записать» или клавишей N. */
export function CreatePage() {
  return (
    <>
      <div className="page-head">
        <h1>Что создать?</h1>
      </div>
      <div className="stack">
        {OPTIONS.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="card create-option">
            <span className="area-mark" aria-hidden>
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span>
              <b>{title}</b>
              <span className="muted small">{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

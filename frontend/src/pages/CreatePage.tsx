import { BookOpen, NotebookPen, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

const OPTIONS = [
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

/** Выбор, что создать, — нужен на телефоне, где нет боковой панели. */
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

import { BookOpen, NotebookPen, Plus, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const ITEMS = [
  { to: '/goals/new', label: 'Цель', hint: 'измеримая, со сроком', icon: Target },
  { to: '/knowledge/notes/new', label: 'Заметка', hint: 'тема для повторения', icon: NotebookPen },
  { to: '/knowledge/materials/new', label: 'Материал', hint: 'книга, курс, лекция', icon: BookOpen },
];

/** Кнопка «Создать» с выбором, что именно создать. */
export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Меню закрывается при переходе на другую страницу.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="create-menu" ref={root}>
      <button
        type="button"
        className="btn btn--primary btn--block"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={16} aria-hidden /> Создать
      </button>
      {open && (
        <div className="create-menu__popover" role="menu">
          {ITEMS.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} to={to} role="menuitem" className="create-menu__item">
              <Icon size={17} strokeWidth={1.8} aria-hidden />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

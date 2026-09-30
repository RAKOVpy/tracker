import { Brain, FolderKanban, Inbox, ListTodo, Plus, Settings, Sun, Target, type LucideIcon } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAreas, useKnowledge, useToday, useWork } from '../api/hooks';
import { isForToday } from '../domain/tasks';
import { isTyping } from '../lib/keyboard';
import { LoadingState } from '../pages/states';
import { QuickCaptureContext, useQuickCapture } from './quickCapture';
import { QuickCapture } from './tasks/QuickCapture';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const TODAY: NavItem = { to: '/', label: 'Сегодня', icon: Sun, isActive: (p) => p === '/' };
const INBOX: NavItem = { to: '/inbox', label: 'Входящие', icon: Inbox, isActive: (p) => p === '/inbox' };
const TASKS: NavItem = { to: '/tasks', label: 'Задачи', icon: ListTodo, isActive: (p) => p.startsWith('/tasks') };
const PROJECTS: NavItem = { to: '/projects', label: 'Проекты', icon: FolderKanban, isActive: (p) => p.startsWith('/projects') };
/** На телефоне проекты открываются из «Задач», поэтому и подсвечивается «Задачи». */
const TASKS_MOBILE: NavItem = { ...TASKS, isActive: (p) => p.startsWith('/tasks') || p.startsWith('/projects') };
const GOALS: NavItem = {
  to: '/goals',
  label: 'Цели',
  icon: Target,
  isActive: (p) => p === '/goals' || (p.startsWith('/goals/') && p !== '/goals/new'),
};
const KNOWLEDGE: NavItem = {
  to: '/knowledge',
  label: 'Знания',
  icon: Brain,
  isActive: (p) => p.startsWith('/knowledge') || p === '/review',
};
const SETTINGS: NavItem = { to: '/settings', label: 'Настройки', icon: Settings, isActive: (p) => p === '/settings' };

interface Counts {
  /** Заметок к повторению сегодня. */
  due: number;
  /** Открытых задач на сегодня и с прошедшим сроком. */
  tasks: number;
  /** Неразобранных записей во «Входящих». */
  inbox: number;
}

function useCounts(): Counts {
  const today = useToday();
  const { data: knowledge } = useKnowledge();
  const { data: work } = useWork();
  return {
    due: knowledge?.load.queue.length ?? 0,
    tasks: work?.inWork.filter((t) => isForToday(t, today)).length ?? 0,
    inbox: work?.tasks.filter((t) => t.status === 'inbox').length ?? 0,
  };
}

function Sidebar() {
  const { data: areas } = useAreas();
  const counts = useCounts();
  const openCapture = useQuickCapture();
  const { pathname, search } = useLocation();
  const activeArea = pathname === '/goals' ? new URLSearchParams(search).get('area') : null;
  // Когда выбрана сфера, подсвечивается она, а не общий пункт «Цели».
  const isActive = (item: NavItem) => item.isActive(pathname) && !(item === GOALS && activeArea);

  const link = (item: NavItem, count?: number, badge?: string) => (
    <Link key={item.to} to={item.to} className={isActive(item) ? 'nav__link active' : 'nav__link'} aria-current={isActive(item) ? 'page' : undefined}>
      <item.icon size={17} strokeWidth={1.8} aria-hidden /> {item.label}
      {count ? (
        <span className={badge ? 'nav__count nav__count--due' : 'nav__count'} aria-label={badge ? `${count} ${badge}` : undefined}>
          {count}
        </span>
      ) : null}
    </Link>
  );

  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <Target size={20} strokeWidth={2} aria-hidden /> Трекер
      </Link>

      <button type="button" className="btn btn--primary btn--block capture-button" aria-keyshortcuts="N" onClick={openCapture}>
        <Plus size={16} aria-hidden /> Записать
        <kbd aria-hidden>N</kbd>
      </button>

      <nav className="nav" aria-label="Разделы">
        {link(TODAY)}
        {link(INBOX, counts.inbox)}
        {link(TASKS, counts.tasks, 'на сегодня')}
        {link(PROJECTS)}
        {link(GOALS)}
        {link(KNOWLEDGE, counts.due, 'к повторению')}
      </nav>

      {areas && areas.length > 0 && (
        <nav className="nav" aria-label="Сферы">
          <span className="nav__label">Сферы</span>
          {areas.map((area) => (
            <Link
              key={area.id}
              to={`/goals?area=${area.id}`}
              className={`nav__link tone-${area.color}${activeArea === area.id ? ' active' : ''}`}
              aria-current={activeArea === area.id ? 'page' : undefined}
            >
              <span className="nav__dot" aria-hidden /> {area.name}
            </Link>
          ))}
        </nav>
      )}

      <nav className="nav sidebar__footer" aria-label="Настройки">
        {link(SETTINGS)}
      </nav>
    </aside>
  );
}

function MobileTop() {
  const { pathname } = useLocation();
  const counts = useCounts();
  return (
    <header className="mobile-top">
      <Link to="/" className="brand">
        <Target size={20} strokeWidth={2} aria-hidden /> Трекер
      </Link>
      <nav className="mobile-top__links" aria-label="Входящие и настройки">
        {[INBOX, SETTINGS].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={item.isActive(pathname) ? 'icon-btn mobile-top__link active' : 'icon-btn mobile-top__link'}
            aria-label={item === INBOX && counts.inbox ? `${item.label}: ${counts.inbox}` : item.label}
            aria-current={item.isActive(pathname) ? 'page' : undefined}
          >
            <item.icon size={20} strokeWidth={1.8} aria-hidden />
            {item === INBOX && counts.inbox > 0 && (
              <span className="bottom-nav__badge bottom-nav__badge--muted" aria-hidden>
                {counts.inbox}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const counts = useCounts();
  const openCapture = useQuickCapture();
  const badges = new Map<NavItem, { count: number; label: string }>([
    [TASKS_MOBILE, { count: counts.tasks, label: 'на сегодня' }],
    [KNOWLEDGE, { count: counts.due, label: 'к повторению' }],
  ]);

  const link = (item: NavItem) => {
    const badge = badges.get(item);
    return (
      <Link
        key={item.to}
        to={item.to}
        className={item.isActive(pathname) ? 'bottom-nav__link active' : 'bottom-nav__link'}
        aria-current={item.isActive(pathname) ? 'page' : undefined}
      >
        <span className="bottom-nav__icon">
          <item.icon size={21} strokeWidth={1.8} aria-hidden />
          {badge && badge.count > 0 && (
            <span className="bottom-nav__badge" aria-label={`${badge.count} ${badge.label}`}>
              {badge.count}
            </span>
          )}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="bottom-nav" aria-label="Разделы">
      {link(TODAY)}
      {link(TASKS_MOBILE)}
      <button type="button" className="bottom-nav__link bottom-nav__capture" onClick={openCapture}>
        <span className="bottom-nav__plus">
          <Plus size={22} strokeWidth={2} aria-hidden />
        </span>
        Записать
      </button>
      {link(GOALS)}
      {link(KNOWLEDGE)}
    </nav>
  );
}

export function Layout() {
  const [capturing, setCapturing] = useState(false);
  const openCapture = useCallback(() => setCapturing(true), []);

  // N — записать из любого места, если не печатаешь в поле. По коду клавиши, чтобы работало и в русской раскладке.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'KeyN' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      setCapturing(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <QuickCaptureContext.Provider value={openCapture}>
      <div className="shell">
        <Sidebar />
        <div className="content">
          <MobileTop />
          <main className="container">
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </main>
          <BottomNav />
        </div>
      </div>
      <QuickCapture open={capturing} onClose={() => setCapturing(false)} />
    </QuickCaptureContext.Provider>
  );
}

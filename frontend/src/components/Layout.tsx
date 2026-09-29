import { Brain, Plus, Settings, Sun, Target, type LucideIcon } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAreas, useKnowledge } from '../api/hooks';
import { CreateMenu } from './CreateMenu';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const TODAY: NavItem = { to: '/', label: 'Сегодня', icon: Sun, isActive: (p) => p === '/' };
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
const CREATE: NavItem = { to: '/new', label: 'Создать', icon: Plus, isActive: (p) => p === '/new' };
const SETTINGS: NavItem = { to: '/settings', label: 'Настройки', icon: Settings, isActive: (p) => p === '/settings' };

/** Сколько заметок ждёт повторения — число рядом с пунктом «Знания». */
function useDueCount(): number {
  const { data } = useKnowledge();
  return data?.due.length ?? 0;
}

function Sidebar() {
  const { data: areas } = useAreas();
  const dueCount = useDueCount();
  const { pathname, search } = useLocation();
  const activeArea = pathname === '/goals' ? new URLSearchParams(search).get('area') : null;
  // Когда выбрана сфера, подсвечивается она, а не общий пункт «Цели».
  const isActive = (item: NavItem) => item.isActive(pathname) && !(item === GOALS && activeArea);

  const link = (item: NavItem, count?: number) => (
    <Link key={item.to} to={item.to} className={isActive(item) ? 'nav__link active' : 'nav__link'} aria-current={isActive(item) ? 'page' : undefined}>
      <item.icon size={17} strokeWidth={1.8} aria-hidden /> {item.label}
      {count ? (
        <span className="nav__count nav__count--due" aria-label={`${count} к повторению`}>
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

      <CreateMenu />

      <nav className="nav" aria-label="Разделы">
        {link(TODAY)}
        {link(GOALS)}
        {link(KNOWLEDGE, dueCount)}
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

function BottomNav() {
  const { pathname } = useLocation();
  const dueCount = useDueCount();
  const isActive = (item: NavItem) => item.isActive(pathname);
  return (
    <nav className="bottom-nav" aria-label="Разделы">
      {[TODAY, GOALS, CREATE, KNOWLEDGE, SETTINGS].map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={isActive(item) ? 'bottom-nav__link active' : 'bottom-nav__link'}
          aria-current={isActive(item) ? 'page' : undefined}
        >
          <span className="bottom-nav__icon">
            <item.icon size={21} strokeWidth={1.8} aria-hidden />
            {item === KNOWLEDGE && dueCount > 0 && (
              <span className="bottom-nav__badge" aria-label={`${dueCount} к повторению`}>
                {dueCount}
              </span>
            )}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Layout() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="content">
        <header className="mobile-top">
          <Link to="/" className="brand">
            <Target size={20} strokeWidth={2} aria-hidden /> Трекер
          </Link>
        </header>
        <main className="container">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

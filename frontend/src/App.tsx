import { Link, Outlet, Route, Routes } from 'react-router-dom';
import { EditGoalPage, NewGoalPage } from './pages/GoalFormPages';
import { GoalPage } from './pages/GoalPage';
import { TodayPage } from './pages/TodayPage';

function Layout() {
  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="logo">
            <span aria-hidden>🎯</span> Трекер целей
          </Link>
          <Link to="/goals/new" className="btn btn--primary btn--sm">
            + Цель
          </Link>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="goals/new" element={<NewGoalPage />} />
        <Route path="goals/:id" element={<GoalPage />} />
        <Route path="goals/:id/edit" element={<EditGoalPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}

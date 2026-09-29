import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EditGoalPage, NewGoalPage } from './pages/GoalFormPages';
import { GoalPage } from './pages/GoalPage';
import { GoalsPage } from './pages/GoalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="goals/new" element={<NewGoalPage />} />
        <Route path="goals/:id" element={<GoalPage />} />
        <Route path="goals/:id/edit" element={<EditGoalPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}

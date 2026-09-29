import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CreatePage } from './pages/CreatePage';
import { EditGoalPage, NewGoalPage } from './pages/GoalFormPages';
import { GoalPage } from './pages/GoalPage';
import { GoalsPage } from './pages/GoalsPage';
import { KnowledgePage } from './pages/knowledge/KnowledgePage';
import { EditMaterialPage, MaterialPage, NewMaterialPage } from './pages/knowledge/MaterialPages';
import { EditNotePage, NewNotePage, NotePage } from './pages/knowledge/NotePages';
import { ReviewPage } from './pages/knowledge/ReviewPage';
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
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/materials/new" element={<NewMaterialPage />} />
        <Route path="knowledge/materials/:id" element={<MaterialPage />} />
        <Route path="knowledge/materials/:id/edit" element={<EditMaterialPage />} />
        <Route path="knowledge/notes/new" element={<NewNotePage />} />
        <Route path="knowledge/notes/:id" element={<NotePage />} />
        <Route path="knowledge/notes/:id/edit" element={<EditNotePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="new" element={<CreatePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}

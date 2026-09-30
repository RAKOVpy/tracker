import { lazy, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TodayPage } from './pages/TodayPage';

/**
 * Разделы грузятся, когда их открывают: главный экран «Сегодня» — сразу, остальное — отдельными
 * файлами, чтобы первый запуск был быстрым. Страницы одного раздела лежат в одном файле.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const tasks = () => import('./pages/tasks/TaskPages');
const materials = () => import('./pages/knowledge/MaterialPages');
const notes = () => import('./pages/knowledge/NotePages');
const goalForms = () => import('./pages/GoalFormPages');
const projects = () => import('./pages/projects/ProjectPages');

const InboxPage = page(() => import('./pages/tasks/InboxPage'), 'InboxPage');
const TasksPage = page(() => import('./pages/tasks/TasksPage'), 'TasksPage');
const TaskPage = page(tasks, 'TaskPage');
const NewTaskPage = page(tasks, 'NewTaskPage');
const EditTaskPage = page(tasks, 'EditTaskPage');
const ProjectsPage = page(() => import('./pages/projects/ProjectsPage'), 'ProjectsPage');
const ProjectPage = page(projects, 'ProjectPage');
const NewProjectPage = page(projects, 'NewProjectPage');
const EditProjectPage = page(projects, 'EditProjectPage');
const GoalsPage = page(() => import('./pages/GoalsPage'), 'GoalsPage');
const GoalPage = page(() => import('./pages/GoalPage'), 'GoalPage');
const NewGoalPage = page(goalForms, 'NewGoalPage');
const EditGoalPage = page(goalForms, 'EditGoalPage');
const KnowledgePage = page(() => import('./pages/knowledge/KnowledgePage'), 'KnowledgePage');
const MaterialPage = page(materials, 'MaterialPage');
const NewMaterialPage = page(materials, 'NewMaterialPage');
const EditMaterialPage = page(materials, 'EditMaterialPage');
const NotePage = page(notes, 'NotePage');
const NewNotePage = page(notes, 'NewNotePage');
const EditNotePage = page(notes, 'EditNotePage');
const ReviewPage = page(() => import('./pages/knowledge/ReviewPage'), 'ReviewPage');
const CreatePage = page(() => import('./pages/CreatePage'), 'CreatePage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const WeekPage = page(() => import('./pages/WeekPage'), 'WeekPage');

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/new" element={<NewTaskPage />} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route path="tasks/:id/edit" element={<EditTaskPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="projects/:id/edit" element={<EditProjectPage />} />
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
        <Route path="week" element={<WeekPage />} />
        <Route path="new" element={<CreatePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  );
}

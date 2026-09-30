import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/onest';
import App from './App.tsx';
import { AuthError, NotFoundError, serverMode } from './api';
import { AuthGate } from './components/auth/AuthGate';
import { saveErrorText } from './components/errors';
import { Toasts } from './components/Toasts';
import { showToast } from './lib/toasts';
import './index.css';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Данным в браузере сеть не нужна; с сервером без интернета запросы ждут связи, а не падают.
      networkMode: serverMode ? 'online' : 'always',
      // Без входа и для удалённой записи повтор не поможет; при сбое сети — пробуем ещё дважды.
      retry: (failures, error) => !(error instanceof AuthError || error instanceof NotFoundError) && failures < 2,
    },
    mutations: { networkMode: serverMode ? 'online' : 'always' },
  },
  // Любое несохранённое изменение видно сразу, даже если экран сам ошибку не показывает.
  // Формы, которые показывают ошибку у себя (отпуск, восстановление из копии), помечены meta.ownErrors.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (error instanceof NotFoundError) void queryClient.invalidateQueries();
      if (mutation.meta?.ownErrors || error instanceof AuthError) return;
      showToast(saveErrorText(error));
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <App />
        </AuthGate>
      </BrowserRouter>
      <Toasts />
    </QueryClientProvider>
  </StrictMode>,
);

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { auth, onUnauthorized, type User } from '../../api';
import { LoginPage } from '../../pages/LoginPage';
import { AccountContext } from './account';
import { AuthScreen, UnreachableScreen } from './AuthScreen';

type State =
  | { kind: 'checking' }
  | { kind: 'unreachable'; message: string }
  | { kind: 'signed-out'; registration: boolean; firstAccount: boolean; expired: boolean }
  | { kind: 'signed-in'; user: User };

/** Без сервера данные в браузере — приложение открывается сразу. С сервером — после входа. */
export function AuthGate({ children }: { children: ReactNode }) {
  return auth ? <ServerGate>{children}</ServerGate> : children;
}

function ServerGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<State>({ kind: 'checking' });
  const pending = useRef<Promise<void> | null>(null);

  /** Спросить сервер, кто вошёл. Несколько одновременных вызовов — один запрос. */
  const check = useCallback((expired: boolean) => {
    pending.current ??= (async () => {
      try {
        const session = await auth!.session();
        setState(
          session.user
            ? { kind: 'signed-in', user: session.user }
            : { kind: 'signed-out', registration: session.registration, firstAccount: session.firstAccount, expired },
        );
      } catch (error) {
        setState({ kind: 'unreachable', message: error instanceof Error ? error.message : 'Неизвестная ошибка.' });
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, []);

  useEffect(() => {
    void check(false);
  }, [check]);

  // Любой запрос получил 401: сессия закончилась или из аккаунта вышли в другой вкладке.
  useEffect(
    () =>
      onUnauthorized(() => {
        setState((current) => (current.kind === 'signed-in' ? { kind: 'checking' } : current));
        void check(true);
      }),
    [check],
  );

  // Пока никто не вошёл, данных прошлого аккаунта в памяти нет: следующий вход начнёт с чистого листа.
  const signedIn = state.kind === 'signed-in';
  useEffect(() => {
    if (!signedIn) client.clear();
  }, [signedIn, client]);

  const logout = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      await auth!.logout();
    } catch {
      // Вышли или нет — покажет проверка сессии: при сбое связи будет экран «Сервер не отвечает».
    }
    await check(false);
  }, [check]);

  switch (state.kind) {
    case 'checking':
      return <AuthScreen busy />;
    case 'unreachable':
      return <UnreachableScreen message={state.message} onRetry={() => void check(false)} />;
    case 'signed-out':
      return (
        <LoginPage
          registration={state.registration}
          firstAccount={state.firstAccount}
          expired={state.expired}
          onSignedIn={(user) => setState({ kind: 'signed-in', user })}
        />
      );
    case 'signed-in':
      return <AccountContext.Provider value={{ user: state.user, logout }}>{children}</AccountContext.Provider>;
  }
}

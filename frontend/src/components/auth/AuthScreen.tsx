import { CloudOff, RotateCw, Target } from 'lucide-react';
import type { ReactNode } from 'react';

/** Экран до входа: знак трекера и карточка по центру. */
export function AuthScreen({ children, busy = false }: { children?: ReactNode; busy?: boolean }) {
  return (
    <main className="auth" aria-busy={busy || undefined}>
      <div className="auth__panel">
        <p className="brand auth__brand">
          <Target size={22} strokeWidth={2} aria-hidden /> Трекер
        </p>
        {busy ? <p className="muted auth__loading">Загрузка…</p> : children}
      </div>
    </main>
  );
}

export function UnreachableScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AuthScreen>
      <section className="card auth__card auth__card--center" aria-labelledby="unreachable-title">
        <span className="empty__icon">
          <CloudOff size={26} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="auth__head">
          <h1 id="unreachable-title">Сервер не отвечает</h1>
          <p className="muted">{message}</p>
        </div>
        <button className="btn btn--primary" type="button" onClick={onRetry}>
          <RotateCw size={16} aria-hidden /> Повторить
        </button>
      </section>
    </AuthScreen>
  );
}

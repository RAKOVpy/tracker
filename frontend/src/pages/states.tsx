import { RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, DataError, NetworkError } from '../api';

export function LoadingState() {
  return <p className="muted">Загрузка…</p>;
}

export function ErrorState({ error }: { error: unknown }) {
  const isDataError = error instanceof DataError || error instanceof SyntaxError;
  // Сбой связи или сервера проходит сам: достаточно попробовать ещё раз.
  const isTransient = error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
  return (
    <div className="card empty">
      <h2>Не удалось загрузить данные</h2>
      <p className="muted">{error instanceof Error ? error.message : 'Неизвестная ошибка.'}</p>
      {isDataError && (
        <p className="muted small">
          Похоже, данные в браузере повреждены. В настройках можно восстановить их из резервной копии или начать заново.
        </p>
      )}
      {isTransient ? (
        <button className="btn" type="button" onClick={() => window.location.reload()}>
          <RotateCw size={16} aria-hidden /> Обновить страницу
        </button>
      ) : (
        <Link className="btn" to="/settings">
          Открыть настройки
        </Link>
      )}
    </div>
  );
}

export function NotFoundState({ title, back }: { title: string; back: string }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      <p className="muted">Возможно, запись удалили или ссылка устарела.</p>
      <Link className="btn" to={back}>
        Вернуться
      </Link>
    </div>
  );
}

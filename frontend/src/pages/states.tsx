import { Link } from 'react-router-dom';
import { DataError } from '../api';

export function LoadingState() {
  return <p className="muted">Загрузка…</p>;
}

export function ErrorState({ error }: { error: unknown }) {
  const isDataError = error instanceof DataError || error instanceof SyntaxError;
  return (
    <div className="card empty">
      <h2>Не удалось загрузить данные</h2>
      <p className="muted">{error instanceof Error ? error.message : 'Неизвестная ошибка.'}</p>
      {isDataError && (
        <p className="muted small">
          Похоже, данные в браузере повреждены. В настройках можно восстановить их из резервной копии или начать заново.
        </p>
      )}
      <Link className="btn" to="/settings">
        Открыть настройки
      </Link>
    </div>
  );
}

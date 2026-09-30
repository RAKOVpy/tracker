import { NetworkError, NotFoundError } from '../api';

/** Текст для сообщения «не сохранилось». */
export function saveErrorText(error: unknown): string {
  if (error instanceof NetworkError) return `Изменение не сохранилось. ${error.message}`;
  if (error instanceof NotFoundError) return 'Изменение не сохранилось: запись уже удалена — возможно, в другой вкладке. Список обновлён.';
  const message = error instanceof Error && error.message ? error.message : 'Неизвестная ошибка.';
  return `Изменение не сохранилось. ${message}`;
}

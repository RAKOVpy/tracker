import { Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { api, readBackup, serverMode, type Db } from '../api';
import { useImportData, useResetData } from '../api/hooks';
import { todayIso } from '../lib/dates';
import { downloadText } from '../lib/download';
import { plural } from '../lib/format';

type Status = { kind: 'idle' } | { kind: 'success'; text: string } | { kind: 'error'; text: string };

function describeCounts(db: Db): string {
  const parts: [number, [string, string, string]][] = [
    [db.goals.length, ['цель', 'цели', 'целей']],
    [db.tasks.length, ['задача', 'задачи', 'задач']],
    [db.projects.length, ['проект', 'проекта', 'проектов']],
    [db.entries.length, ['запись прогресса', 'записи прогресса', 'записей прогресса']],
    [db.materials.length, ['материал', 'материала', 'материалов']],
    [db.notes.length, ['заметка', 'заметки', 'заметок']],
    [db.reviews.length, ['повторение', 'повторения', 'повторений']],
    [db.areas.length, ['сфера', 'сферы', 'сфер']],
    [db.vacations.length, ['отпуск', 'отпуска', 'отпусков']],
  ];
  const nonEmpty = parts.filter(([count]) => count > 0);
  if (nonEmpty.length === 0) return 'данных нет';
  return nonEmpty.map(([count, forms]) => `${count} ${plural(count, forms)}`).join(', ');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка.';
}

export function DataSettings() {
  const importData = useImportData();
  const resetData = useResetData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ db: Db; fileName: string } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function exportBackup() {
    try {
      const backup = await api.exportData();
      downloadText(JSON.stringify(backup, null, 2), `tracker-backup-${todayIso()}.json`, 'application/json');
      setStatus({ kind: 'success', text: `Резервная копия сохранена: ${describeCounts(backup)}.` });
    } catch (error) {
      setStatus({ kind: 'error', text: `Не удалось сохранить копию. ${errorText(error)}` });
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setConfirmingReset(false);
    try {
      const db = readBackup(await file.text());
      setPending({ db, fileName: file.name });
      setStatus({ kind: 'idle' });
    } catch (error) {
      setPending(null);
      setStatus({ kind: 'error', text: `Файл «${file.name}» не подходит. ${errorText(error)}` });
    }
  }

  function confirmImport() {
    if (!pending) return;
    importData.mutate(pending.db, {
      onSuccess: () => {
        setStatus({ kind: 'success', text: `Данные восстановлены из «${pending.fileName}».` });
        setPending(null);
      },
      onError: (error) => setStatus({ kind: 'error', text: `Не удалось восстановить. ${errorText(error)}` }),
    });
  }

  function confirmReset() {
    resetData.mutate(undefined, {
      onSuccess: () => {
        setStatus({ kind: 'success', text: 'Все данные удалены. Сферы и настройки вернулись к исходным.' });
        setConfirmingReset(false);
      },
    });
  }

  return (
    <div className="stack">
      {serverMode ? (
        <p className="notice">
          Данные хранятся на сервере: каждое изменение сохраняется сразу, и на любом устройстве после входа трекер открывается
          с теми же данными. Резервная копия — на случай, если с сервером что-то случится.
        </p>
      ) : (
        <p className="notice">
          Пока данные хранятся только в этом браузере. Если очистить данные сайта или открыть трекер на другом устройстве,
          их там не будет. Сохраняйте резервную копию хотя бы раз в неделю.
        </p>
      )}

      <div className="row">
        <button className="btn btn--sm" type="button" onClick={exportBackup}>
          <Download size={15} aria-hidden /> Скачать резервную копию
        </button>
        <button className="btn btn--sm" type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={15} aria-hidden /> Восстановить из файла
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden
          onChange={chooseFile}
        />
      </div>

      {pending && (
        <div className="confirm">
          <p>
            В файле «{pending.fileName}»: {describeCounts(pending.db)}. {serverMode ? 'Все текущие данные аккаунта будут заменены.' : 'Текущие данные в этом браузере будут заменены.'}
          </p>
          <div className="row">
            <button className="btn btn--sm btn--danger-solid" type="button" disabled={importData.isPending} onClick={confirmImport}>
              Заменить данные
            </button>
            <button className="btn btn--sm" type="button" onClick={() => setPending(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {status.kind !== 'idle' && (
        <p className={status.kind === 'success' ? 'notice notice--good' : 'notice notice--bad'} role="status">
          {status.text}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        {confirmingReset ? (
          <div className="confirm">
            <p>
              Удалить все задачи, проекты, цели, материалы, заметки, повторения, сферы, настройки и отпуска{' '}
              {serverMode ? 'в аккаунте — на всех устройствах' : 'в этом браузере'}? Если резервной копии нет, вернуть их не
              получится.
            </p>
            <div className="row">
              <button className="btn btn--sm btn--danger-solid" type="button" disabled={resetData.isPending} onClick={confirmReset}>
                Удалить всё
              </button>
              <button className="btn btn--sm" type="button" onClick={() => setConfirmingReset(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn--sm btn--ghost btn--danger"
            type="button"
            onClick={() => {
              setPending(null);
              setConfirmingReset(true);
            }}
          >
            <RotateCcw size={15} aria-hidden /> Удалить все данные
          </button>
        )}
      </div>
    </div>
  );
}

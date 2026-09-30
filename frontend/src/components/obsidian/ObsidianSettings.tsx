import { FolderOpen, RefreshCw, Unplug } from 'lucide-react';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { formatDateTime } from '../../lib/dates';
import { useObsidian, type SyncPhase } from '../../obsidian/useObsidian';
import { ObsidianGuide } from './ObsidianGuide';
import { SyncReportView } from './SyncReportView';

type Obsidian = ReturnType<typeof useObsidian>;

/** Скрытый <input webkitdirectory>: выбор папки там, где браузер не умеет её запоминать. */
function FolderInput({ obsidian, children, primary }: { obsidian: Obsidian; children: ReactNode; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files) void obsidian.syncFiles(files).finally(() => (event.target.value = ''));
  }
  return (
    <>
      <button
        className={primary ? 'btn btn--primary btn--sm' : 'btn btn--sm'}
        type="button"
        disabled={obsidian.busy}
        onClick={() => input.current?.click()}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        // webkitdirectory нет в типах React, но его понимают все современные браузеры.
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        multiple
        onChange={onChange}
        data-testid="vault-folder-input"
      />
    </>
  );
}

export function SyncPhaseView({ phase, obsidian }: { phase: SyncPhase; obsidian: Obsidian }) {
  if (phase.kind === 'reading') return <p className="notice">Читаю файлы хранилища… найдено {phase.found}</p>;
  if (phase.kind === 'saving') return <p className="notice">Сохраняю заметки…</p>;
  if (phase.kind === 'error') return <p className="notice notice--bad">{phase.message}</p>;
  if (phase.kind === 'done') {
    return <SyncReportView report={phase.report} isVaultRoot={phase.isVaultRoot} onPauseMissing={obsidian.pauseNotes} />;
  }
  return null;
}

/** Кнопка синхронизации для подключённого хранилища — одинаковая в настройках и в «Знаниях». */
export function SyncButton({ obsidian, label = 'Синхронизировать' }: { obsidian: Obsidian; label?: string }) {
  const icon = <RefreshCw size={15} aria-hidden className={obsidian.busy ? 'spin' : undefined} />;
  if (obsidian.info?.method === 'folder' && obsidian.canPickFolder) {
    return (
      <button className="btn btn--primary btn--sm" type="button" disabled={obsidian.busy} onClick={obsidian.syncFolder}>
        {icon} {label}
      </button>
    );
  }
  return (
    <FolderInput obsidian={obsidian} primary>
      {icon} {label}
    </FolderInput>
  );
}

export function ObsidianSettings() {
  const obsidian = useObsidian();
  const { info, canPickFolder, busy } = obsidian;

  return (
    <div className="stack">
      {info ? (
        <>
          <div className="vault-status">
            <span className="vault-status__name">Хранилище «{info.vaultName}»</span>
            <span className="muted small">
              {info.lastSyncAt ? `синхронизировано ${formatDateTime(info.lastSyncAt)}` : 'ещё не синхронизировано'}
              {info.method === 'files' && ' · папку нужно выбирать при каждой синхронизации'}
            </span>
          </div>
          <div className="row">
            <SyncButton obsidian={obsidian} />
            {canPickFolder && (
              <button className="btn btn--sm" type="button" disabled={busy} onClick={obsidian.connectFolder}>
                <FolderOpen size={15} aria-hidden /> Выбрать другую папку
              </button>
            )}
            <button className="btn btn--sm btn--ghost" type="button" disabled={busy} onClick={obsidian.disconnect}>
              <Unplug size={15} aria-hidden /> Отключить
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            Трекер читает из папки хранилища заметки с тегом #review: вопросы из раздела «Вопросы» и суть из раздела «Суть».
            Заметки остаются в Obsidian — трекер их не меняет.
          </p>
          <div className="row">
            {canPickFolder ? (
              <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={obsidian.connectFolder}>
                <FolderOpen size={15} aria-hidden /> Выбрать папку хранилища
              </button>
            ) : (
              <FolderInput obsidian={obsidian} primary>
                <FolderOpen size={15} aria-hidden /> Выбрать папку хранилища
              </FolderInput>
            )}
          </div>
          <p className="muted small">
            {canPickFolder
              ? 'Браузер запомнит папку — дальше хватит кнопки «Синхронизировать». Файлы читаются только на этом компьютере и никуда не отправляются.'
              : 'В этом браузере папку нужно выбирать при каждой синхронизации. В Chrome или Edge она запоминается. Файлы никуда не отправляются.'}
          </p>
        </>
      )}

      <SyncPhaseView phase={obsidian.phase} obsidian={obsidian} />
      <ObsidianGuide />
    </div>
  );
}

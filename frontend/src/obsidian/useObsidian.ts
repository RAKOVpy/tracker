import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import type { SyncReport } from './sync';
import {
  ensureReadPermission,
  forgetVaultHandle,
  loadVaultHandle,
  loadVaultInfo,
  pickVaultDirectory,
  readDirectory,
  readFileList,
  saveVaultHandle,
  saveVaultInfo,
  supportsDirectoryPicker,
  type ReadProgress,
  type VaultContents,
  type VaultInfo,
} from './vault';

export type SyncPhase =
  | { kind: 'idle' }
  | { kind: 'reading'; found: number }
  | { kind: 'saving' }
  | { kind: 'done'; report: SyncReport; isVaultRoot: boolean }
  | { kind: 'error'; message: string };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Браузер не дал доступ к папке. Нажмите «Синхронизировать» ещё раз и разрешите чтение.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Папка хранилища не найдена: возможно, её переместили или переименовали. Выберите её заново.';
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка.';
}

/** Подключение к хранилищу Obsidian и синхронизация. */
export function useObsidian() {
  const client = useQueryClient();
  const [info, setInfo] = useState<VaultInfo | null>(loadVaultInfo);
  const [phase, setPhase] = useState<SyncPhase>({ kind: 'idle' });
  const busy = phase.kind === 'reading' || phase.kind === 'saving';

  async function run(method: VaultInfo['method'], read: (onProgress: (p: ReadProgress) => void) => Promise<VaultContents>) {
    setPhase({ kind: 'reading', found: 0 });
    try {
      const contents = await read(({ found }) => setPhase({ kind: 'reading', found }));
      setPhase({ kind: 'saving' });
      // Разбор Markdown и YAML загружается только при синхронизации.
      const { parseVault } = await import('./parse');
      const report = await api.syncObsidian(parseVault(contents.vaultName, contents.files));
      const next: VaultInfo = { vaultName: contents.vaultName, method, lastSyncAt: new Date().toISOString() };
      saveVaultInfo(next);
      setInfo(next);
      await client.invalidateQueries();
      setPhase({ kind: 'done', report, isVaultRoot: contents.isVaultRoot });
    } catch (error) {
      setPhase({ kind: 'error', message: describe(error) });
    }
  }

  /** Выбрать папку (Chrome, Edge): доступ запомнится для следующих синхронизаций. */
  async function connectFolder() {
    let handle;
    try {
      handle = await pickVaultDirectory();
    } catch (error) {
      if (!isAbort(error)) setPhase({ kind: 'error', message: describe(error) });
      return;
    }
    try {
      await saveVaultHandle(handle);
    } catch {
      // Если браузер не смог запомнить папку, синхронизируем сейчас, а в следующий раз спросим снова.
    }
    await run('folder', (onProgress) => readDirectory(handle, onProgress));
  }

  async function syncFolder() {
    const handle = await loadVaultHandle();
    if (!handle) {
      setPhase({ kind: 'error', message: 'Браузер забыл папку хранилища. Выберите её заново.' });
      return;
    }
    try {
      if (!(await ensureReadPermission(handle))) {
        setPhase({ kind: 'error', message: 'Без разрешения на чтение папки синхронизировать нельзя.' });
        return;
      }
    } catch (error) {
      setPhase({ kind: 'error', message: describe(error) });
      return;
    }
    await run('folder', (onProgress) => readDirectory(handle, onProgress));
  }

  /** Файлы из <input webkitdirectory> (Firefox, Safari). */
  async function syncFiles(files: FileList) {
    if (files.length === 0) return;
    await run(info?.method === 'folder' ? 'folder' : 'files', (onProgress) => readFileList(files, onProgress));
  }

  async function disconnect() {
    await forgetVaultHandle();
    saveVaultInfo(null);
    setInfo(null);
    setPhase({ kind: 'idle' });
  }

  async function pauseNotes(ids: string[]) {
    for (const id of ids) await api.updateNote(id, { status: 'paused' });
    await client.invalidateQueries();
  }

  return {
    info,
    phase,
    busy,
    canPickFolder: supportsDirectoryPicker(),
    connectFolder,
    syncFolder,
    syncFiles,
    disconnect,
    pauseNotes,
    resetPhase: () => setPhase({ kind: 'idle' }),
  };
}

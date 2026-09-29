import type { VaultFile } from './parse';

/**
 * Доступ к папке хранилища Obsidian из браузера.
 * - Chrome, Edge и другие на Chromium: File System Access API. Доступ к папке запоминается
 *   (дескриптор хранится в IndexedDB), при синхронизации браузер может переспросить разрешение.
 * - Firefox и Safari: выбор папки через <input webkitdirectory> при каждой синхронизации.
 */

// Части File System Access API, которых нет в стандартных типах TypeScript.
type PermissionMode = { mode: 'read' | 'readwrite' };
export interface VaultDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?(descriptor: PermissionMode): Promise<PermissionState>;
  requestPermission?(descriptor: PermissionMode): Promise<PermissionState>;
}
type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<VaultDirectoryHandle>;

const MAX_FILE_SIZE = 1024 * 1024;
const SKIPPED_FOLDERS = /^(\.|node_modules$)/;

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickVaultDirectory(): Promise<VaultDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  return picker({ id: 'obsidian-vault', mode: 'read' });
}

/** Проверяет доступ и при необходимости просит его. Просить можно только в ответ на действие пользователя. */
export async function ensureReadPermission(handle: VaultDirectoryHandle): Promise<boolean> {
  const mode: PermissionMode = { mode: 'read' };
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(mode)) === 'granted') return true;
  return (await handle.requestPermission(mode)) === 'granted';
}

export interface ReadProgress {
  found: number;
}

function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

export interface VaultContents {
  vaultName: string;
  files: VaultFile[];
  /** В корне есть папка .obsidian — значит, выбран именно корень хранилища. */
  isVaultRoot: boolean;
}

/** Читает все .md-файлы хранилища, пропуская служебные папки (.obsidian, .trash, .git). */
export async function readDirectory(
  handle: FileSystemDirectoryHandle,
  onProgress?: (progress: ReadProgress) => void,
): Promise<VaultContents> {
  const files: VaultFile[] = [];
  let isVaultRoot = false;
  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'directory') {
        if (prefix === '' && name === '.obsidian') isVaultRoot = true;
        if (!SKIPPED_FOLDERS.test(name)) await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`);
      } else if (isMarkdown(name)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size <= MAX_FILE_SIZE) {
          files.push({ path: `${prefix}${name}`, content: await file.text() });
          onProgress?.({ found: files.length });
        }
      }
    }
  }
  await walk(handle, '');
  return { vaultName: handle.name, files, isVaultRoot };
}

/** Файлы из <input webkitdirectory>: первая часть пути — имя папки хранилища. */
export async function readFileList(
  list: FileList | File[],
  onProgress?: (progress: ReadProgress) => void,
): Promise<VaultContents> {
  const files: VaultFile[] = [];
  let vaultName = '';
  let isVaultRoot = false;
  for (const file of Array.from(list)) {
    const relative = file.webkitRelativePath || file.name;
    const [root, ...rest] = relative.split('/');
    vaultName ||= rest.length > 0 ? root : '';
    const path = rest.length > 0 ? rest.join('/') : relative;
    const folders = path.split('/').slice(0, -1);
    if (folders[0] === '.obsidian') isVaultRoot = true;
    if (!isMarkdown(file.name) || file.size > MAX_FILE_SIZE || folders.some((f) => SKIPPED_FOLDERS.test(f))) continue;
    files.push({ path, content: await file.text() });
    onProgress?.({ found: files.length });
  }
  return { vaultName: vaultName || 'Obsidian', files, isVaultRoot };
}

// ---------- запоминание папки ----------

const DB_NAME = 'tracker-obsidian';
const STORE = 'handles';
const HANDLE_KEY = 'vault';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveVaultHandle(handle: VaultDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export async function loadVaultHandle(): Promise<VaultDirectoryHandle | null> {
  try {
    return ((await withStore('readonly', (store) => store.get(HANDLE_KEY))) as VaultDirectoryHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function forgetVaultHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY));
  } catch {
    // нечего забывать
  }
}

// ---------- сведения о подключении ----------

const INFO_KEY = 'tracker:obsidian';

export interface VaultInfo {
  vaultName: string;
  /** folder — доступ к папке запомнен; files — папку выбирают при каждой синхронизации. */
  method: 'folder' | 'files';
  lastSyncAt: string | null;
}

export function loadVaultInfo(): VaultInfo | null {
  try {
    const raw = localStorage.getItem(INFO_KEY);
    return raw ? (JSON.parse(raw) as VaultInfo) : null;
  } catch {
    return null;
  }
}

export function saveVaultInfo(info: VaultInfo | null): void {
  if (info) localStorage.setItem(INFO_KEY, JSON.stringify(info));
  else localStorage.removeItem(INFO_KEY);
}

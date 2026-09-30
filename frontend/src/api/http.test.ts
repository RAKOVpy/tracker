import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedVault } from '../obsidian/sync';
import { obsidianUri } from '../obsidian/uri';
import { createAuthApi } from './auth';
import { createHttp, onUnauthorized } from './http';
import { createHttpApi } from './httpApi';
import { ApiError, AuthError, NetworkError, NotFoundError, VacationError } from './types';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[];
let replies: Array<Response | Error | ((call: Call) => Response)>;

function json(status: number, data?: unknown): Response {
  return new Response(data === undefined ? null : JSON.stringify(data), {
    status,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubGlobal('document', { cookie: 'theme=dark; csrftoken=tok%3D1' });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const reply = replies.shift() ?? json(200, []);
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(call) : reply;
  });
});

afterEach(() => vi.unstubAllGlobals());

const http = () => createHttp('/api/');

describe('http', () => {
  it('sends JSON, CSRF token and time zone', async () => {
    replies.push(json(201, { id: 'a' }));
    const result = await http().request('POST', '/areas/', { name: 'Работа' });
    expect(result).toEqual({ id: 'a' });
    const [call] = calls;
    expect(call.url).toBe('/api/areas/');
    expect(call.body).toEqual({ name: 'Работа' });
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.headers['X-CSRFToken']).toBe('tok=1');
    expect(call.headers['X-Timezone']).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('does not send the CSRF token with GET', async () => {
    await http().request('GET', '/areas/');
    expect(calls[0].headers['X-CSRFToken']).toBeUndefined();
    expect(calls[0].headers['Content-Type']).toBeUndefined();
  });

  it('returns undefined for 204', async () => {
    replies.push(json(204));
    expect(await http().request('DELETE', '/areas/x/')).toBeUndefined();
  });

  it('maps errors to readable exceptions', async () => {
    replies.push(json(400, { detail: 'Дедлайн раньше старта.', errors: {} }));
    await expect(http().request('POST', '/goals/', {})).rejects.toEqual(new ApiError('Дедлайн раньше старта.', 400));

    replies.push(json(400, { detail: 'На эти дни уже есть отпуск.' }));
    const vacation = http().request('POST', '/vacations/', {}, { invalid: (m) => new VacationError(m) });
    await expect(vacation).rejects.toBeInstanceOf(VacationError);

    replies.push(json(404, { detail: 'Страница не найдена.' }));
    await expect(http().request('GET', '/goals/x/', undefined, { what: 'Цель' })).rejects.toEqual(new NotFoundError('Цель'));

    replies.push(json(429, { detail: 'Слишком много попыток.' }));
    await expect(http().request('POST', '/auth/login/', {})).rejects.toMatchObject({ status: 429, message: 'Слишком много попыток.' });

    replies.push(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(http().request('GET', '/tasks/')).rejects.toMatchObject({ name: 'ApiError', status: 502 });

    replies.push(json(500, { detail: 'Traceback…' }));
    await expect(http().request('GET', '/tasks/')).rejects.toThrow('Сервер не смог выполнить запрос');
  });

  it('reports a lost connection and a timeout', async () => {
    replies.push(new TypeError('Failed to fetch'));
    await expect(http().request('GET', '/tasks/')).rejects.toBeInstanceOf(NetworkError);
    replies.push(new DOMException('timed out', 'TimeoutError'));
    await expect(http().request('GET', '/tasks/')).rejects.toThrow('не ответил вовремя');
  });

  it('tells listeners about 401 and throws AuthError', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    replies.push(json(401, { detail: 'Нужно войти.' }));
    await expect(http().request('GET', '/tasks/')).rejects.toBeInstanceOf(AuthError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    replies.push(json(401, { detail: 'Нужно войти.' }));
    await expect(http().request('GET', '/tasks/')).rejects.toBeInstanceOf(AuthError);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('refreshes a missing CSRF cookie and retries once', async () => {
    replies.push(json(403, { detail: 'CSRF Failed: CSRF cookie not set.' }), json(200, { user: null }), json(201, { id: 't' }));
    expect(await http().request('POST', '/tasks/', { title: 'А' })).toEqual({ id: 't' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/tasks/', 'GET /api/auth/session/', 'POST /api/tasks/']);

    calls = [];
    replies.push(json(403, { detail: 'CSRF Failed: CSRF token missing.' }), json(200, {}), json(403, { detail: 'CSRF Failed: CSRF token missing.' }));
    await expect(http().request('POST', '/tasks/', {})).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(3);
  });
});

describe('httpApi', () => {
  const api = () => createHttpApi(createHttp('/api'));

  it('maps methods to endpoints', async () => {
    const a = api();
    await a.listEntries('g 1');
    await a.updateTask('t1', { status: 'done' });
    await a.createNote({ title: 'Н', materialId: null, questions: [], summary: '', obsidianUri: '' }, { addedOn: '2026-09-01' });
    replies.push(json(204));
    await a.importData({ areas: [] } as never);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/entries/?goal=g%201',
      'PATCH /api/tasks/t1/',
      'POST /api/notes/',
      'POST /api/import/',
    ]);
    expect(calls[1].body).toEqual({ status: 'done' });
    expect(calls[2].body).toMatchObject({ title: 'Н', addedOn: '2026-09-01' });
    expect(calls[3].body).toEqual({ version: 8, areas: [] });
  });

  it('treats deleting a missing object as done', async () => {
    replies.push(json(404, { detail: 'Не найдено.' }));
    await expect(api().deleteTask('gone')).resolves.toBeUndefined();
    replies.push(json(500, { detail: 'x' }));
    await expect(api().deleteTask('t')).rejects.toBeInstanceOf(ApiError);
  });

  it('turns vacation rule errors into VacationError', async () => {
    replies.push(json(400, { detail: 'На эти дни уже есть отпуск.' }));
    await expect(api().updateVacation('v', { start: '2030-01-01', end: null })).rejects.toEqual(new VacationError('На эти дни уже есть отпуск.'));
  });

  it('sends only new and changed notes after reading the Obsidian vault', async () => {
    const note = (id: string, title: string, path: string) => ({
      id, title, materialId: null, questions: ['?'], summary: '', obsidianUri: obsidianUri('Учёба', path), status: 'active', addedOn: '2026-09-01',
      obsidianPath: path, createdAt: '2026-09-01T00:00:00Z',
    });
    const settings = { dailyReviewLimit: 15, activeMaterialsLimit: 3, newNotesPerDay: 5, strictMode: false };
    replies.push(
      json(200, []), // сферы
      json(200, []), // материалы
      json(200, [note('n1', 'Графы', 'Графы.md'), note('n2', 'Кучи', 'Кучи.md')]),
      json(200, settings),
      json(200, []), // отпуска
      json(200, { materials: 0, notes: 2 }),
    );
    const vault: ParsedVault = {
      vaultName: 'Учёба',
      filesRead: 3,
      materials: [],
      notes: [
        { path: 'Графы.md', title: 'Графы', questions: ['?'], summary: '', materialRef: null },
        { path: 'Кучи.md', title: 'Кучи', questions: ['Что такое куча?'], summary: '', materialRef: null },
        { path: 'Стек.md', title: 'Стек', questions: ['?'], summary: '', materialRef: null },
      ],
    } as unknown as ParsedVault;
    const report = await api().syncObsidian(vault);
    expect(report.notesUpdated).toEqual(['Кучи']);
    expect(report.notesCreated).toEqual(['Стек']);
    const apply = calls.at(-1)!;
    expect(`${apply.method} ${apply.url}`).toBe('POST /api/obsidian/apply/');
    const sent = apply.body as { notes: { id: string; title: string }[]; materials: unknown[] };
    expect(sent.notes.map((n) => n.title)).toEqual(['Кучи', 'Стек']);
    expect(sent.materials).toEqual([]);
  });

  it('skips the apply request when nothing changed', async () => {
    replies.push(json(200, []), json(200, []), json(200, []), json(200, { newNotesPerDay: 5, activeMaterialsLimit: 3 }), json(200, []));
    await api().syncObsidian({ vaultName: 'V', filesRead: 0, materials: [], notes: [] } as unknown as ParsedVault);
    expect(calls).toHaveLength(5);
  });
});

describe('auth', () => {
  it('logs in and unwraps the user', async () => {
    replies.push(json(200, { user: { id: 1, email: 'me@example.com' } }));
    const user = await createAuthApi(createHttp('/api')).login('me@example.com', 'secret');
    expect(user).toEqual({ id: 1, email: 'me@example.com' });
    expect(calls[0].body).toEqual({ email: 'me@example.com', password: 'secret' });
  });
});

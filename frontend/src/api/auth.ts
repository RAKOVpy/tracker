import type { Http } from './http';

export interface User {
  id: number;
  email: string;
  /** Управляет сервером: регистрацией и аккаунтами. Первый аккаунт на сервере — администратор. */
  isAdmin: boolean;
}

export interface Session {
  /** null — никто не вошёл. */
  user: User | null;
  /** Можно ли завести новый аккаунт на этом сервере. */
  registration: boolean;
  /** Аккаунтов ещё нет: первый станет администратором. */
  firstAccount: boolean;
}

export interface AuthApi {
  /** Кто вошёл. Заодно сервер выдаёт куку CSRF и запоминает часовой пояс. */
  session(): Promise<Session>;
  login(email: string, password: string): Promise<User>;
  register(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

export function createAuthApi(http: Http): AuthApi {
  return {
    session: () => http.request<Session>('GET', '/auth/session/'),
    login: async (email, password) => (await http.request<{ user: User }>('POST', '/auth/login/', { email, password })).user,
    register: async (email, password) => (await http.request<{ user: User }>('POST', '/auth/register/', { email, password })).user,
    logout: () => http.request<void>('POST', '/auth/logout/'),
    changePassword: (current, next) => http.request<void>('POST', '/auth/password/', { currentPassword: current, newPassword: next }),
  };
}

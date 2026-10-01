import type { Http } from './http';

/** Аккаунт на сервере — для администратора. Даты — ISO с временем. */
export interface Account {
  id: number;
  email: string;
  isAdmin: boolean;
  dateJoined: string;
  /** null — ещё ни разу не входил. */
  lastLogin: string | null;
}

/**
 * Раздел «Сервер» в настройках — только для администратора: регистрация и аккаунты.
 * Писем сервер не отправляет: забытый пароль администратор заменяет временным и передаёт сам.
 */
export interface ServerApi {
  registration(): Promise<boolean>;
  setRegistration(open: boolean): Promise<boolean>;
  accounts(): Promise<Account[]>;
  /** Новый временный пароль; прежний перестаёт работать, входы на устройствах завершаются. */
  resetPassword(id: number): Promise<string>;
  deleteAccount(id: number): Promise<void>;
}

export function createServerApi(http: Http): ServerApi {
  return {
    registration: async () => (await http.request<{ registration: boolean }>('GET', '/site/')).registration,
    setRegistration: async (open) => (await http.request<{ registration: boolean }>('PATCH', '/site/', { registration: open })).registration,
    accounts: () => http.request<Account[]>('GET', '/accounts/'),
    resetPassword: async (id) => (await http.request<{ password: string }>('POST', `/accounts/${id}/password/`)).password,
    deleteAccount: (id) => http.request<void>('DELETE', `/accounts/${id}/`),
  };
}

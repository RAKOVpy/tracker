import { createContext, useContext } from 'react';
import type { User } from '../../api';

export interface Account {
  user: User;
  logout: () => Promise<void>;
}

export const AccountContext = createContext<Account | null>(null);

/** Кто вошёл. null — сервера нет, данные хранятся в браузере. */
export function useAccount(): Account | null {
  return useContext(AccountContext);
}

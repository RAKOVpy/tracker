import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { server, type Account } from '../../api';
import { formatRelative, formatShort, todayIso } from '../../lib/dates';
import { useAccount } from './account';

const keys = {
  registration: ['server', 'registration'] as const,
  accounts: ['server', 'accounts'] as const,
};

/** «сегодня», «вчера», «3 окт» — по часовому поясу браузера. */
function day(isoDateTime: string): string {
  return formatRelative(todayIso(new Date(isoDateTime)));
}

function RegistrationSetting() {
  const client = useQueryClient();
  const registration = useQuery({ queryKey: keys.registration, queryFn: () => server!.registration() });
  // Флажок переключается сразу, пока запрос в пути; при ошибке возвращается.
  const [wanted, setWanted] = useState<boolean | null>(null);
  const update = useMutation({
    mutationFn: (open: boolean) => server!.setRegistration(open),
    onSuccess: (open) => client.setQueryData(keys.registration, open),
    onSettled: () => setWanted(null),
  });
  const open = wanted ?? registration.data;

  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <label className="checkbox setting-row__label" htmlFor="setting-registration">
          <input
            id="setting-registration"
            type="checkbox"
            checked={open ?? false}
            disabled={registration.isLoading || update.isPending}
            onChange={(e) => {
              setWanted(e.target.checked);
              update.mutate(e.target.checked);
            }}
          />
          <span>Открытая регистрация</span>
        </label>
        <div className="muted small">
          {open === false
            ? 'Закрыта: на экране входа нет кнопки «Зарегистрироваться». Аккаунты, которые уже есть, работают как раньше.'
            : 'Аккаунт может завести любой, кто откроет сайт. Когда все свои зарегистрировались, регистрацию можно закрыть.'}
        </div>
      </div>
    </div>
  );
}

function TemporaryPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Буфер обмена недоступен — пароль виден на экране, его можно выделить.
    }
  }

  return (
    <div className="notice notice--good account-row__result" role="status">
      <p>
        Временный пароль для <strong className="account__email">{email}</strong>:
      </p>
      <div className="row">
        <code className="temp-password">{password}</code>
        <button className="btn btn--sm" type="button" onClick={copy}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
      <p>Передайте его и попросите сменить в «Настройках» → «Аккаунт». Больше он нигде не появится.</p>
      <div>
        <button className="btn btn--sm btn--ghost" type="button" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}

type Confirming = { account: Account; action: 'password' | 'delete' } | null;

function AccountList({ selfId }: { selfId: number }) {
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: keys.accounts, queryFn: () => server!.accounts() });
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const reset = useMutation({
    mutationFn: (account: Account) => server!.resetPassword(account.id),
    onSuccess: (password, account) => {
      setConfirming(null);
      setIssued({ email: account.email, password });
    },
  });
  const remove = useMutation({
    mutationFn: (account: Account) => server!.deleteAccount(account.id),
    onSuccess: () => {
      setConfirming(null);
      return client.invalidateQueries({ queryKey: keys.accounts });
    },
  });

  if (accounts.isLoading) return <p className="muted small">Загружаем аккаунты…</p>;
  if (!accounts.data) return <p className="notice notice--bad">Список аккаунтов не загрузился. Обновите страницу.</p>;
  const busy = reset.isPending || remove.isPending;

  return (
    <div className="stack">
      <h3>
        Аккаунты <span className="section__count">{accounts.data.length}</span>
      </h3>
      <ul className="area-list account-list">
        {accounts.data.map((account) => {
          const self = account.id === selfId;
          const asking = confirming?.account.id === account.id ? confirming.action : null;
          return (
            <li key={account.id} className="account-row">
              <div className="account-row__main">
                <div className="account-row__head">
                  <span className="account__email">{account.email}</span>
                  {self && <span className="badge">вы</span>}
                  {account.isAdmin && <span className="badge badge--accent">администратор</span>}
                </div>
                <div className="task-row__meta">
                  <span>с {formatShort(todayIso(new Date(account.dateJoined)))}</span>
                  <span>{account.lastLogin ? `последний вход ${day(account.lastLogin)}` : 'входа ещё не было'}</span>
                </div>
              </div>
              {!self && !asking && (
                <div className="row account-row__actions">
                  <button className="btn btn--sm" type="button" disabled={busy} onClick={() => setConfirming({ account, action: 'password' })}>
                    <KeyRound size={14} aria-hidden /> Временный пароль
                  </button>
                  <button
                    className="btn btn--sm btn--ghost btn--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming({ account, action: 'delete' })}
                  >
                    <Trash2 size={14} aria-hidden /> Удалить
                  </button>
                </div>
              )}
              {asking === 'password' && (
                <div className="confirm confirm--quiet account-row__result">
                  <p>
                    Выдать временный пароль для {account.email}? Прежний перестанет работать, входы на всех устройствах завершатся.
                    Данные аккаунта останутся.
                  </p>
                  <div className="row">
                    <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => reset.mutate(account)}>
                      <KeyRound size={14} aria-hidden /> Выдать пароль
                    </button>
                    <button className="btn btn--sm" type="button" onClick={() => setConfirming(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {asking === 'delete' && (
                <div className="confirm account-row__result">
                  <p>
                    Удалить аккаунт {account.email} вместе со всеми его целями, задачами и заметками? Отменить это нельзя.
                  </p>
                  <div className="row">
                    <button className="btn btn--sm btn--danger-solid" type="button" disabled={busy} onClick={() => remove.mutate(account)}>
                      <Trash2 size={14} aria-hidden /> Удалить навсегда
                    </button>
                    <button className="btn btn--sm" type="button" onClick={() => setConfirming(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {issued && issued.email === account.email && (
                <TemporaryPassword email={issued.email} password={issued.password} onClose={() => setIssued(null)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Раздел «Сервер»: только у администратора, только когда данные на сервере. */
export function ServerSettings() {
  const account = useAccount();
  if (!server || !account?.user.isAdmin) return null;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <RegistrationSetting />
      <AccountList selfId={account.user.id} />
    </div>
  );
}

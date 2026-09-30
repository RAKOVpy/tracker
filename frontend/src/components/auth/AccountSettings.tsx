import { KeyRound, LogOut } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { auth } from '../../api';
import { useAccount } from './account';
import { PasswordInput } from './PasswordInput';

function PasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await auth!.changePassword(current, next);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не получилось сменить пароль.');
      setPending(false);
    }
  }

  return (
    <form className="form account__form" onSubmit={submit}>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-current`}>
          Текущий пароль
        </label>
        <PasswordInput id={`${id}-current`} value={current} onChange={setCurrent} autoComplete="current-password" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-next`}>
          Новый пароль
        </label>
        <PasswordInput id={`${id}-next`} value={next} onChange={setNext} autoComplete="new-password" describedBy={`${id}-hint`} />
        <span id={`${id}-hint`} className="field__hint">
          Не короче 8 символов. На других устройствах после смены нужно будет войти заново.
        </span>
      </div>
      {error && (
        <p className="notice notice--bad" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn--primary btn--sm" type="submit" disabled={pending}>
          Сменить пароль
        </button>
        <button className="btn btn--sm" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

/** Кто вошёл, смена пароля и выход. Только когда данные на сервере. */
export function AccountSettings() {
  const account = useAccount();
  const [changing, setChanging] = useState(false);
  const [changed, setChanged] = useState(false);
  if (!account) return null;

  return (
    <div className="stack">
      <p>
        Вы вошли как <strong className="account__email">{account.user.email}</strong>.
      </p>
      {changing ? (
        <PasswordForm
          onDone={() => {
            setChanging(false);
            setChanged(true);
          }}
          onCancel={() => setChanging(false)}
        />
      ) : (
        <div className="row">
          <button
            className="btn btn--sm"
            type="button"
            onClick={() => {
              setChanged(false);
              setChanging(true);
            }}
          >
            <KeyRound size={15} aria-hidden /> Сменить пароль
          </button>
          <button className="btn btn--sm btn--ghost" type="button" onClick={() => void account.logout()}>
            <LogOut size={15} aria-hidden /> Выйти
          </button>
        </div>
      )}
      {changed && (
        <p className="notice notice--good" role="status">
          Пароль изменён. На других устройствах нужно будет войти заново.
        </p>
      )}
    </div>
  );
}

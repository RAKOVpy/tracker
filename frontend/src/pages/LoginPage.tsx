import { useId, useState, type FormEvent } from 'react';
import { auth, type User } from '../api';
import { AuthScreen } from '../components/auth/AuthScreen';
import { PasswordInput } from '../components/auth/PasswordInput';

type Mode = 'login' | 'register' | 'first';

const TEXT: Record<Mode, { title: string; lead: string; submit: string; pending: string }> = {
  login: {
    title: 'Вход',
    lead: 'Цели, задачи и учёба — те же на телефоне и на компьютере.',
    submit: 'Войти',
    pending: 'Входим…',
  },
  register: {
    title: 'Новый аккаунт',
    lead: 'Данные будут храниться на этом сервере и откроются на любом устройстве после входа.',
    submit: 'Создать аккаунт',
    pending: 'Создаём…',
  },
  first: {
    title: 'Первый аккаунт',
    lead: 'На этом сервере ещё нет аккаунтов. Первый станет администратором: сможет закрыть регистрацию и выдать временный пароль тому, кто забыл свой.',
    submit: 'Создать аккаунт',
    pending: 'Создаём…',
  },
};

export function LoginPage({
  registration,
  firstAccount,
  expired,
  onSignedIn,
}: {
  registration: boolean;
  /** Аккаунтов ещё нет: при открытой регистрации экран сразу предлагает создать первый. */
  firstAccount: boolean;
  expired: boolean;
  onSignedIn: (user: User) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(firstAccount && registration ? 'first' : 'login');
  const creating = mode !== 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const text = TEXT[mode];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = creating ? await auth!.register(email, password) : await auth!.login(email, password);
      onSignedIn(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не получилось. Попробуйте ещё раз.');
      setPending(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <AuthScreen>
      <section className="card auth__card" aria-labelledby={`${id}-title`}>
        <div className="auth__head">
          <h1 id={`${id}-title`}>{text.title}</h1>
          <p className="muted">{text.lead}</p>
        </div>

        {expired && mode === 'login' && <p className="notice">Сессия закончилась — войдите снова. Данные на месте.</p>}

        <form className="form auth__form" onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-email`}>
              Почта
            </label>
            <input
              id={`${id}-email`}
              className="input"
              type="email"
              inputMode="email"
              autoComplete={creating ? 'email' : 'username'}
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-password`}>
              Пароль
            </label>
            <PasswordInput
              id={`${id}-password`}
              value={password}
              onChange={setPassword}
              autoComplete={creating ? 'new-password' : 'current-password'}
              describedBy={creating ? `${id}-hint` : undefined}
            />
            {creating && (
              <span id={`${id}-hint`} className="field__hint">
                Не короче 8 символов, не только цифры и не из списка самых частых.
              </span>
            )}
          </div>

          {error && (
            <p className="notice notice--bad" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
            {pending ? text.pending : text.submit}
          </button>
        </form>

        {mode === 'login' && registration && (
          <p className="auth__switch">
            Ещё нет аккаунта?{' '}
            <button type="button" className="link-button" onClick={() => switchMode('register')}>
              Зарегистрироваться
            </button>
          </p>
        )}
        {mode === 'login' && firstAccount && !registration && (
          <p className="notice">
            Аккаунтов ещё нет, а регистрация закрыта. Создайте аккаунт на сервере командой{' '}
            <code>python manage.py adduser почта --admin</code>.
          </p>
        )}
        {mode === 'login' && !firstAccount && (
          <p className="auth__switch auth__switch--quiet">
            Забыли пароль? Попросите администратора этого сервера: он выдаст временный пароль в настройках трекера.
          </p>
        )}
        {mode === 'register' && (
          <p className="auth__switch">
            Уже есть аккаунт?{' '}
            <button type="button" className="link-button" onClick={() => switchMode('login')}>
              Войти
            </button>
          </p>
        )}
      </section>
    </AuthScreen>
  );
}

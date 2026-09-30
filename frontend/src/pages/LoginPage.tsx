import { useId, useState, type FormEvent } from 'react';
import { auth, type User } from '../api';
import { AuthScreen } from '../components/auth/AuthScreen';
import { PasswordInput } from '../components/auth/PasswordInput';

type Mode = 'login' | 'register';

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
};

export function LoginPage({
  registration,
  expired,
  onSignedIn,
}: {
  registration: boolean;
  expired: boolean;
  onSignedIn: (user: User) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('login');
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
      const user = mode === 'login' ? await auth!.login(email, password) : await auth!.register(email, password);
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
              autoComplete={mode === 'login' ? 'username' : 'email'}
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              describedBy={mode === 'register' ? `${id}-hint` : undefined}
            />
            {mode === 'register' && (
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
        {mode === 'login' && (
          <p className="auth__switch auth__switch--quiet">
            Забыли пароль? На сервере его меняет команда <code>python manage.py changepassword почта</code>.
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

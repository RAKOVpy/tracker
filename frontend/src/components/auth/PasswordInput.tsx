import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/** Поле пароля с кнопкой «показать»: на телефоне проще проверить, что набрано. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password">
      <input
        id={id}
        className="input"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="icon-btn password__toggle"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
      </button>
    </div>
  );
}

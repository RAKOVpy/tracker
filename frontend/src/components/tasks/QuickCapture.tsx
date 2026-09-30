import { Flag, Inbox } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateTask, useToday } from '../../api/hooks';
import { taskInput } from '../../domain/tasks';
import { addDays, type IsoDate } from '../../lib/dates';

interface Props {
  open: boolean;
  onClose: () => void;
}

type When = 'inbox' | 'today' | 'tomorrow';

const MORE = [
  { to: '/tasks/new', label: 'Задача' },
  { to: '/projects/new', label: 'Проект' },
  { to: '/goals/new', label: 'Цель' },
  { to: '/knowledge/notes/new', label: 'Заметка' },
  { to: '/knowledge/materials/new', label: 'Материал' },
];

/**
 * Быстрая запись: одно поле, Enter — и можно писать следующее. Без даты запись попадает
 * во «Входящие» и разбирается потом; с «Сегодня» или «Завтра» — сразу становится задачей.
 */
export function QuickCapture({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const today = useToday();
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('inbox');
  const [important, setImportant] = useState(false);
  const [saved, setSaved] = useState<{ title: string; where: string } | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function reset() {
    setTitle('');
    setWhen('inbox');
    setImportant(false);
    setSaved(null);
  }

  function close() {
    reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    const plannedDate: IsoDate | null = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : null;
    create.mutate(
      taskInput({ title: text, status: plannedDate ? 'todo' : 'inbox', important, plannedDate }),
      {
        onSuccess: () => {
          setSaved({ title: text, where: when === 'today' ? 'на сегодня' : when === 'tomorrow' ? 'на завтра' : 'во «Входящие»' });
          setTitle('');
          setWhen('inbox');
          setImportant(false);
          input.current?.focus();
        },
      },
    );
  }

  const chip = (value: When, label: string) => (
    <button type="button" className="chip" aria-pressed={when === value} onClick={() => setWhen(when === value ? 'inbox' : value)}>
      {label}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      className="capture"
      aria-labelledby="capture-title"
      onClose={close}
      // Щелчок по затемнению вокруг окна закрывает его.
      onClick={(event) => event.target === dialog.current && close()}
    >
      <form className="capture__form" onSubmit={submit}>
        <label className="capture__title" id="capture-title" htmlFor="capture-input">
          Записать
        </label>
        <input
          ref={input}
          id="capture-input"
          className="input capture__input"
          placeholder="Позвонить в банк, законспектировать лекцию 5…"
          autoComplete="off"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(null);
          }}
        />
        <div className="capture__options">
          <div className="segmented" role="group" aria-label="Когда">
            {chip('today', 'Сегодня')}
            {chip('tomorrow', 'Завтра')}
            <button type="button" className="chip" aria-pressed={important} onClick={() => setImportant((v) => !v)}>
              <Flag size={14} aria-hidden /> Важно
            </button>
          </div>
          <span className="muted small">
            {when === 'inbox' ? 'Без даты — во «Входящие», разберёте потом.' : `Сразу задача ${when === 'today' ? 'на сегодня' : 'на завтра'}.`}
          </span>
        </div>

        <p className="capture__saved small" role="status">
          {saved && (
            <>
              <Inbox size={14} aria-hidden /> «{saved.title}» — записано {saved.where}. Можно писать следующее.
            </>
          )}
        </p>

        <div className="capture__footer">
          <div className="row">
            <button className="btn btn--primary btn--sm" type="submit" disabled={!title.trim() || create.isPending}>
              Записать
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={close}>
              Закрыть
            </button>
          </div>
          <nav className="capture__more small" aria-label="Создать подробно">
            <span className="muted">Подробно:</span>
            {MORE.map((item) => (
              <Link key={item.to} to={item.to} onClick={close}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </form>
    </dialog>
  );
}

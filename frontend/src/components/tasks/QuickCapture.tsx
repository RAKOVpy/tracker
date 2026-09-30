import { Flag, Inbox } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateTask, useProjectMap, useToday } from '../../api/hooks';
import type { ParsedTask } from '../../domain/parseTask';
import { anchorRecurrence } from '../../domain/recurrence';
import { taskInput } from '../../domain/tasks';
import type { TaskInput } from '../../domain/types';
import { addDays, type IsoDate } from '../../lib/dates';
import { ParsedChips } from './ParsedChips';
import { useTaskParser } from './useTaskParser';

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
 * Что получится из записи. Дата, повтор или проект (из текста или кнопками) делают её сразу задачей,
 * иначе она попадает во «Входящие». Кнопки «Сегодня» и «Завтра» важнее даты в тексте.
 */
function captureInput(parsed: ParsedTask, extra: { plannedDate: IsoDate | null; important: boolean; today: IsoDate }): TaskInput {
  let { plannedDate, deadline, recurrence } = parsed;
  if (extra.plannedDate) {
    plannedDate = extra.plannedDate;
    if (recurrence) ({ recurrence, plannedDate, deadline } = anchorRecurrence(recurrence, { plannedDate, deadline }, extra.today));
  }
  const isTask = plannedDate !== null || deadline !== null || recurrence !== null || parsed.projectId !== null;
  return taskInput({
    title: parsed.title,
    status: isTask ? 'todo' : 'inbox',
    important: extra.important || parsed.important,
    plannedDate,
    deadline,
    recurrence,
    areaId: parsed.areaId,
    projectId: parsed.projectId,
  });
}

/** Куда попала запись: «на сегодня», «в задачи», «во «Входящие»». */
function destination(input: TaskInput, today: IsoDate): string {
  if (input.status === 'inbox') return 'во «Входящие»';
  if (input.plannedDate === today) return 'на сегодня';
  if (input.plannedDate === addDays(today, 1)) return 'на завтра';
  return 'в задачи';
}

function statusLine(input: TaskInput, projectTitle: string | undefined, today: IsoDate): string {
  if (input.status === 'inbox') return 'Без даты — во «Входящие», разберёте потом.';
  const where = destination(input, today);
  if (where !== 'в задачи') return `Сразу задача ${where}.`;
  return projectTitle ? `Сразу в проект «${projectTitle}».` : 'Сразу в задачи.';
}

/**
 * Быстрая запись: одно поле, Enter — и можно писать следующее. Без даты запись попадает
 * во «Входящие» и разбирается потом; с датой — сразу становится задачей. Дату, срок, повтор,
 * важность и сферу можно дописать словами: «до пт», «каждое вс», «!важно», «#учёба».
 */
export function QuickCapture({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const today = useToday();
  const projects = useProjectMap();
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('inbox');
  const [important, setImportant] = useState(false);
  const [saved, setSaved] = useState<{ title: string; where: string } | null>(null);
  const { parsed, dismiss, reset: resetParser } = useTaskParser(title);
  const chipDate: IsoDate | null = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : null;
  const draft = captureInput(parsed, { plannedDate: chipDate, important, today });
  // Задача проекта без своей сферы берёт сферу проекта — как в форме задачи.
  const project = draft.projectId ? projects.get(draft.projectId) : undefined;

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
    resetParser();
  }

  function close() {
    reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title) return;
    const task = { ...draft, areaId: draft.areaId ?? project?.areaId ?? null };
    create.mutate(task, {
      onSuccess: () => {
        setSaved({ title: task.title, where: project ? `в проект «${project.title}»` : destination(task, today) });
        setTitle('');
        setWhen('inbox');
        setImportant(false);
        resetParser();
        input.current?.focus();
      },
    });
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
            <button
              type="button"
              className="chip"
              aria-pressed={draft.important}
              // «!важно» в тексте снимается так же, как крестиком на подсказке.
              onClick={() => {
                const token = parsed.tokens.find((t) => t.kind === 'important');
                if (token) dismiss(token.text);
                else setImportant((v) => !v);
              }}
            >
              <Flag size={14} aria-hidden /> Важно
            </button>
          </div>
          <span className="muted small">{statusLine(draft, project?.title, today)}</span>
        </div>

        {parsed.tokens.length > 0 ? (
          <ParsedChips parsed={parsed} today={today} onDismiss={dismiss} />
        ) : (
          <p className="capture__hint small">
            Можно дописать: <kbd>завтра</kbd> <kbd>в пт</kbd> <kbd>до 15 окт</kbd> <kbd>каждое вс</kbd> <kbd>!важно</kbd>{' '}
            <kbd>#сфера</kbd>
          </p>
        )}

        <p className="capture__saved small" role="status">
          {saved && (
            <>
              <Inbox size={14} aria-hidden /> «{saved.title}» — записано {saved.where}. Можно писать следующее.
            </>
          )}
        </p>

        <div className="capture__footer">
          <div className="row">
            <button className="btn btn--primary btn--sm" type="submit" disabled={!draft.title || create.isPending}>
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

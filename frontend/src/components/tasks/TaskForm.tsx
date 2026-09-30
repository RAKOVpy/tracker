import { Flag, Plus, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Area, ChecklistItem, TaskInput } from '../../domain/types';
import { addDays, type IsoDate } from '../../lib/dates';
import { AREA_ICON_COMPONENTS } from '../areaIcons';

export type TaskFields = Omit<TaskInput, 'status'>;

interface Props {
  areas: Area[];
  today: IsoDate;
  initial?: TaskFields;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (fields: TaskFields) => void;
  onCancel: () => void;
}

const EMPTY: TaskFields = { title: '', notes: '', important: false, deadline: null, plannedDate: null, areaId: null, checklist: [] };

const newItem = (text = ''): ChecklistItem => ({ id: crypto.randomUUID(), text, done: false });

export function TaskForm({ areas, today, initial = EMPTY, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<TaskFields>(initial);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initial.checklist.length ? initial.checklist : [newItem()]);
  const [submitted, setSubmitted] = useState(false);
  const focusId = useRef<string | null>(null);

  const titleError = values.title.trim() ? null : 'Что нужно сделать?';
  const planAfterDeadline = values.plannedDate && values.deadline && values.plannedDate > values.deadline;

  function set<K extends keyof TaskFields>(key: K, value: TaskFields[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addItem(after: number) {
    const item = newItem();
    focusId.current = item.id;
    setChecklist((prev) => [...prev.slice(0, after + 1), item, ...prev.slice(after + 1)]);
  }

  function onItemKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addItem(index);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (titleError) return;
    onSubmit({
      ...values,
      title: values.title.trim(),
      notes: values.notes.trim(),
      checklist: checklist.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text),
    });
  }

  const dateChip = (label: string, date: IsoDate | null) => (
    <button type="button" className="chip" aria-pressed={values.plannedDate === date} onClick={() => set('plannedDate', date)}>
      {label}
    </button>
  );

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="task-title">
          Задача
        </label>
        <input
          id="task-title"
          className="input"
          placeholder="Например: законспектировать лекцию 5"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={submitted && Boolean(titleError)}
          autoFocus
        />
        {submitted && titleError && <span className="field__error">{titleError}</span>}
      </div>

      <div>
        <button type="button" className="chip" aria-pressed={values.important} onClick={() => set('important', !values.important)}>
          <Flag size={14} aria-hidden /> Важно
        </button>
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="task-planned">
            Когда делаю
          </label>
          <input
            id="task-planned"
            className="input"
            type="date"
            value={values.plannedDate ?? ''}
            onChange={(e) => set('plannedDate', e.target.value || null)}
          />
          <div className="segmented" role="group" aria-label="Быстрый выбор дня">
            {dateChip('Сегодня', today)}
            {dateChip('Завтра', addDays(today, 1))}
            {dateChip('Без даты', null)}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="task-deadline">
            Дедлайн
          </label>
          <input
            id="task-deadline"
            className="input"
            type="date"
            value={values.deadline ?? ''}
            onChange={(e) => set('deadline', e.target.value || null)}
          />
          <span className="field__hint">Необязательно. По дедлайну видно, что срочно.</span>
        </div>
      </div>
      {planAfterDeadline && (
        <p className="notice notice--warn">План позже дедлайна — к этому дню срок уже пройдёт.</p>
      )}

      <div className="field">
        <span className="field__label" id="task-area-label">
          Сфера
        </span>
        <div className="segmented" role="group" aria-labelledby="task-area-label">
          {areas.map((area) => {
            const Icon = AREA_ICON_COMPONENTS[area.icon];
            return (
              <button
                key={area.id}
                type="button"
                className={`chip chip--tone tone-${area.color}`}
                aria-pressed={values.areaId === area.id}
                onClick={() => set('areaId', area.id)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden /> {area.name}
              </button>
            );
          })}
          <button type="button" className="chip" aria-pressed={values.areaId === null} onClick={() => set('areaId', null)}>
            Без сферы
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="task-checklist-label">
          Подзадачи
        </span>
        <span className="field__hint">Необязательно. Enter добавляет следующий пункт.</span>
        <ul className="question-inputs" aria-labelledby="task-checklist-label">
          {checklist.map((item, index) => (
            <li key={item.id} className="question-inputs__row">
              <span className="question-inputs__n" aria-hidden>
                ·
              </span>
              <input
                ref={(el) => {
                  if (el && focusId.current === item.id) {
                    el.focus();
                    focusId.current = null;
                  }
                }}
                className="input"
                placeholder={index === 0 ? 'Первый шаг' : 'Ещё шаг'}
                value={item.text}
                onChange={(e) => setChecklist((prev) => prev.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => onItemKey(e, index)}
                aria-label={`Подзадача ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Удалить подзадачу ${index + 1}`}
                onClick={() => setChecklist((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== item.id) : [newItem()]))}
              >
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addItem(checklist.length - 1)}>
            <Plus size={15} aria-hidden /> Добавить подзадачу
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="task-notes">
          Заметки
        </label>
        <textarea
          id="task-notes"
          className="textarea"
          placeholder="Подробности, ссылки, контакты"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="row">
        <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
          {submitLabel}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import type { StartCheck } from '../../domain/load';
import { MATERIAL_STATUSES, MATERIAL_STATUS_ORDER, MATERIAL_TYPES, MATERIAL_TYPE_ORDER } from '../../domain/meta';
import type { Area, MaterialInput } from '../../domain/types';
import { AREA_ICON_COMPONENTS } from '../areaIcons';
import { MATERIAL_ICONS } from './format';
import { PartsEditor } from './PartsEditor';
import { StartMaterialNotice } from './StartMaterial';

interface Props {
  areas: Area[];
  initial?: MaterialInput;
  submitLabel: string;
  isSubmitting?: boolean;
  /** Проверка лимитов для материала, который ещё не изучается; нет — проверять нечего. */
  startCheck?: StartCheck;
  /** Сколько задач у каждой части — чтобы предупредить при удалении части. */
  partTasks?: Map<string, number>;
  onSubmit: (input: MaterialInput) => void;
  onCancel: () => void;
}

const EMPTY: MaterialInput = { title: '', type: 'book', author: '', url: '', areaId: null, status: 'active', parts: [] };

export function MaterialForm({ areas, initial = EMPTY, submitLabel, isSubmitting, startCheck, partTasks, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<MaterialInput>(initial);
  const [submitted, setSubmitted] = useState(false);

  const url = values.url.trim();
  const errors = {
    title: values.title.trim() ? null : 'Как называется материал?',
    url: !url || /^https?:\/\//.test(url) ? null : 'Ссылка должна начинаться с http:// или https://',
  };
  const isValid = !errors.title && !errors.url;
  const blocked = startCheck && startCheck.blockers.length > 0 ? startCheck : null;
  // В строгом режиме «Изучаю» недоступно, пока лимит заполнен или есть долг.
  const activeLocked = Boolean(blocked?.strict);

  function set<K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    onSubmit({
      ...values,
      title: values.title.trim(),
      author: values.author.trim(),
      url,
      parts: values.parts.map((p) => ({ ...p, title: p.title.trim() })).filter((p) => p.title),
    });
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="material-title">
          Название
        </label>
        <input
          id="material-title"
          className="input"
          placeholder="Например: «Алгоритмы. Построение и анализ»"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={submitted && Boolean(errors.title)}
          autoFocus
        />
        {submitted && errors.title && <span className="field__error">{errors.title}</span>}
      </div>

      <div className="field">
        <span className="field__label" id="material-type-label">
          Что это
        </span>
        <div className="segmented" role="group" aria-labelledby="material-type-label">
          {MATERIAL_TYPE_ORDER.map((type) => {
            const Icon = MATERIAL_ICONS[type];
            return (
              <button key={type} type="button" className="chip" aria-pressed={values.type === type} onClick={() => set('type', type)}>
                <Icon size={15} strokeWidth={1.8} aria-hidden /> {MATERIAL_TYPES[type]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form__row">
        <div className="field">
          <label className="field__label" htmlFor="material-author">
            Автор
          </label>
          <input
            id="material-author"
            className="input"
            placeholder="Необязательно"
            value={values.author}
            onChange={(e) => set('author', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="material-url">
            Ссылка
          </label>
          <input
            id="material-url"
            className="input"
            inputMode="url"
            placeholder="https://…"
            value={values.url}
            onChange={(e) => set('url', e.target.value)}
            aria-invalid={submitted && Boolean(errors.url)}
          />
          {submitted && errors.url && <span className="field__error">{errors.url}</span>}
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="material-status-label">
          Статус
        </span>
        <div className="segmented" role="group" aria-labelledby="material-status-label">
          {MATERIAL_STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={values.status === status}
              disabled={status === 'active' && activeLocked}
              onClick={() => set('status', status)}
            >
              {MATERIAL_STATUSES[status]}
            </button>
          ))}
        </div>
        {blocked && (values.status === 'active' || activeLocked) && <StartMaterialNotice check={blocked} />}
      </div>

      <div className="field">
        <span className="field__label" id="material-area-label">
          Сфера
        </span>
        <div className="segmented" role="group" aria-labelledby="material-area-label">
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

      <PartsEditor
        type={values.type}
        parts={values.parts}
        initial={initial.parts}
        partTasks={partTasks}
        onChange={(parts) => set('parts', parts)}
      />

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

import { Plus, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MATERIAL_STATUSES } from '../../domain/meta';
import type { Material, NoteInput } from '../../domain/types';

interface Props {
  materials: Material[];
  initial?: NoteInput;
  defaultMaterialId?: string | null;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (input: NoteInput) => void;
  onCancel: () => void;
}

export function NoteForm({ materials, initial, defaultMaterialId = null, submitLabel, isSubmitting, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [materialId, setMaterialId] = useState<string | null>(initial?.materialId ?? defaultMaterialId);
  const [questions, setQuestions] = useState<string[]>(initial?.questions.length ? initial.questions : ['']);
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [obsidianUri, setObsidianUri] = useState(initial?.obsidianUri ?? '');
  const [submitted, setSubmitted] = useState(false);
  const questionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);

  const uri = obsidianUri.trim();
  const errors = {
    title: title.trim() ? null : 'Как называется тема?',
    uri: !uri || uri.startsWith('obsidian://') ? null : 'Ссылка должна начинаться с obsidian://',
  };
  const isValid = !errors.title && !errors.uri;

  // Материалы, которые сейчас изучаются, — первыми.
  const sortedMaterials = [...materials].sort(
    (a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.title.localeCompare(b.title, 'ru'),
  );

  function setQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  }

  function addQuestion(after: number) {
    setQuestions((prev) => [...prev.slice(0, after + 1), '', ...prev.slice(after + 1)]);
    focusIndex.current = after + 1;
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : ['']));
  }

  function onQuestionKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addQuestion(index);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    onSubmit({
      title: title.trim(),
      materialId,
      questions: questions.map((q) => q.trim()).filter(Boolean),
      summary: summary.trim(),
      obsidianUri: uri,
    });
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="note-title">
          Тема
        </label>
        <input
          id="note-title"
          className="input"
          placeholder="Например: Графы — обход в ширину и в глубину"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={submitted && Boolean(errors.title)}
          autoFocus
        />
        {submitted && errors.title && <span className="field__error">{errors.title}</span>}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="note-material">
          Материал
        </label>
        <select
          id="note-material"
          className="select"
          value={materialId ?? ''}
          onChange={(e) => setMaterialId(e.target.value || null)}
        >
          <option value="">Без материала</option>
          {sortedMaterials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {MATERIAL_STATUSES[m.status].toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="field__label" id="note-questions-label">
          Вопросы для самопроверки
        </span>
        <span className="field__hint">
          На повторении вы сначала отвечаете на них по памяти. Enter добавляет следующий вопрос.
        </span>
        <ol className="question-inputs" aria-labelledby="note-questions-label">
          {questions.map((question, index) => (
            <li key={index} className="question-inputs__row">
              <span className="question-inputs__n num" aria-hidden>
                {index + 1}.
              </span>
              <input
                ref={(el) => {
                  questionRefs.current[index] = el;
                  if (el && focusIndex.current === index) {
                    el.focus();
                    focusIndex.current = null;
                  }
                }}
                className="input"
                placeholder={index === 0 ? 'Чем обход в ширину отличается от обхода в глубину?' : 'Ещё вопрос'}
                value={question}
                onChange={(e) => setQuestion(index, e.target.value)}
                onKeyDown={(e) => onQuestionKey(e, index)}
                aria-label={`Вопрос ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Удалить вопрос ${index + 1}`}
                onClick={() => removeQuestion(index)}
              >
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addQuestion(questions.length - 1)}>
            <Plus size={15} aria-hidden /> Добавить вопрос
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="note-summary">
          Ключевые мысли
        </label>
        <span className="field__hint">Короткие ответы, с которыми сверяетесь после того, как вспомнили сами.</span>
        <textarea
          id="note-summary"
          className="textarea"
          rows={5}
          placeholder={'BFS идёт слоями через очередь и находит кратчайший путь…\nDFS уходит вглубь через стек или рекурсию…'}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="note-obsidian">
          Ссылка на заметку в Obsidian
        </label>
        <input
          id="note-obsidian"
          className="input"
          placeholder="obsidian://open?vault=…&file=…"
          value={obsidianUri}
          onChange={(e) => setObsidianUri(e.target.value)}
          aria-invalid={submitted && Boolean(errors.uri)}
        />
        {submitted && errors.uri ? (
          <span className="field__error">{errors.uri}</span>
        ) : (
          <span className="field__hint">В Obsidian: меню заметки ⋯ → «Copy Obsidian URL». Необязательно.</span>
        )}
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

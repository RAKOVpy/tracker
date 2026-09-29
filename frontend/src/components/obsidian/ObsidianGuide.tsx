import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { downloadText } from '../../lib/download';
import { OBSIDIAN_TEMPLATES } from '../../obsidian/templates';

function TemplateCard({ template }: { template: (typeof OBSIDIAN_TEMPLATES)[number] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(template.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен — остаётся кнопка «Скачать».
    }
  }

  return (
    <div className="template-card">
      <div>
        <b>{template.title}</b>
        <p className="muted small">{template.description}</p>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn--sm" type="button" onClick={copy}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Скопировано' : 'Скопировать'}
        </button>
        <button
          className="btn btn--sm btn--ghost"
          type="button"
          onClick={() => downloadText(template.content, template.file, 'text/markdown')}
        >
          <Download size={14} aria-hidden /> {template.file}
        </button>
      </div>
    </div>
  );
}

/** Как вести заметки в Obsidian, чтобы трекер их понимал. */
export function ObsidianGuide() {
  return (
    <details className="guide">
      <summary>Как вести заметки в Obsidian</summary>
      <div className="guide__body">
        <ol className="guide__steps">
          <li>
            <b>Материал.</b> Заведите страницу книги или курса по шаблону «Материал».
          </li>
          <li>
            <b>Конспект.</b> Пока читаете или слушаете, пишите конспект по шаблону «Конспект» — свободно и своими словами.
            Это черновик, трекер его не читает.
          </li>
          <li>
            <b>Заметки.</b> После занятия потратьте 10 минут: выберите в конспекте 1–5 мыслей, которые стоит помнить через
            месяц. Для каждой сделайте заметку по шаблону «Заметка»: суть своими словами, пример и 2–5 вопросов. Тег
            review отправит её в трекер.
          </li>
          <li>
            <b>Синхронизация.</b> Нажмите «Синхронизировать» — новые заметки появятся в разделе «Знания», изменённые
            обновятся. История повторений при этом сохраняется.
          </li>
        </ol>

        <div className="guide__tip">
          <b>Хорошие вопросы</b> проверяют понимание, а не заучивание: «Почему…?», «Чем отличается…?», «Когда
          применять…?», «Что будет, если…?», «Приведите пример…». Вопрос «Что такое X?» лучше заменить на «Зачем нужен X и
          чем он лучше Y?».
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {OBSIDIAN_TEMPLATES.map((template) => (
            <TemplateCard key={template.file} template={template} />
          ))}
        </div>

        <p className="muted small">
          Чтобы вставлять шаблоны одной командой: в Obsidian откройте Настройки → Основные плагины → Шаблоны, укажите папку
          «Шаблоны» и положите туда эти три файла. Вставка — команда «Шаблоны: вставить шаблон». Папку шаблонов трекер
          пропускает сам.
        </p>
      </div>
    </details>
  );
}

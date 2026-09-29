import { useState } from 'react';
import type { SyncReport } from '../../obsidian/sync';
import { formatShort } from '../../lib/dates';
import { plural } from '../../lib/format';

interface Props {
  report: SyncReport;
  isVaultRoot: boolean;
  onPauseMissing: (ids: string[]) => Promise<void>;
}

function TitleList({ title, items, tone }: { title: string; items: string[]; tone?: 'warn' }) {
  if (items.length === 0) return null;
  return (
    <details className={tone === 'warn' ? 'sync-list sync-list--warn' : 'sync-list'}>
      <summary>
        {title} <span className="section__count">{items.length}</span>
      </summary>
      <ul>
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

export function SyncReportView({ report, isVaultRoot, onPauseMissing }: Props) {
  const [pausing, setPausing] = useState(false);
  const [paused, setPaused] = useState(false);
  const n = (count: number, forms: [string, string, string]) => `${count} ${plural(count, forms)}`;

  const changes = [
    report.notesCreated.length && `новых заметок: ${report.notesCreated.length}`,
    report.notesUpdated.length && `обновлено: ${report.notesUpdated.length}`,
    report.notesRenamed.length && `переименовано: ${report.notesRenamed.length}`,
    report.notesLinked.length && `связано с существующими: ${report.notesLinked.length}`,
    report.materialsCreated.length && `новых материалов: ${report.materialsCreated.length}`,
  ].filter(Boolean);
  const totalNotes =
    report.notesCreated.length + report.notesUpdated.length + report.notesRenamed.length + report.notesLinked.length + report.notesUnchanged;

  async function pauseMissing() {
    setPausing(true);
    try {
      await onPauseMissing(report.missing.map((m) => m.id));
      setPaused(true);
    } finally {
      setPausing(false);
    }
  }

  return (
    <div className="sync-report" role="status">
      <p className="notice notice--good">
        Синхронизировано с «{report.vaultName}»: прочитано {n(report.filesRead, ['файл', 'файла', 'файлов'])}, заметок для
        повторения — {totalNotes}. {changes.length ? `${changes.join(', ')}.` : 'Изменений нет.'}
      </p>

      {report.firstReviewsUntil && (
        <p className="notice">
          Новых заметок много, поэтому первые повторения распределены по {report.newNotesPerDay} в день — последние{' '}
          {formatShort(report.firstReviewsUntil)}. Так импорт не превратится в гору повторений на завтра. Сколько вводить в
          день, можно поменять в настройках нагрузки.
        </p>
      )}

      {report.materialsQueued.length > 0 && (
        <p className="notice">
          {n(report.materialsQueued.length, ['новый материал встал', 'новых материала встали', 'новых материалов встали'])} в
          очередь «Хочу изучить»: одновременно можно изучать не больше{' '}
          {n(report.activeMaterialsLimit, ['материала', 'материалов', 'материалов'])}. Заметки по ним повторяются как обычно,
          а начать материал можно на его странице.
        </p>
      )}

      {!isVaultRoot && (
        <p className="notice notice--warn">
          В выбранной папке нет папки .obsidian — похоже, это не корень хранилища. Заметки импортированы, но кнопка
          «Открыть в Obsidian» может не сработать. Выберите папку, которую вы открываете в Obsidian как хранилище.
        </p>
      )}

      {totalNotes === 0 && (
        <p className="notice">
          Заметок с тегом #review не нашлось. Добавьте тег review заметкам, которые хотите повторять, и синхронизируйте ещё
          раз.
        </p>
      )}

      <TitleList title="Новые заметки" items={report.notesCreated} />
      <TitleList title="Обновлены" items={report.notesUpdated} />
      <TitleList title="Файл переименован, история сохранена" items={report.notesRenamed} />
      <TitleList title="Связаны с заметками, созданными в трекере" items={report.notesLinked} />
      <TitleList title="Новые материалы" items={report.materialsCreated} />
      <TitleList
        title="Без вопросов — на повторении нужно будет пересказать тему целиком"
        items={report.withoutQuestions}
        tone="warn"
      />

      {report.missing.length > 0 && (
        <div className="sync-missing">
          <TitleList title="Больше не найдены в хранилище" items={report.missing.map((m) => m.title)} tone="warn" />
          <p className="muted small">
            Файл удалили, переместили под другим названием или убрали тег review. Заметки остались в трекере вместе с
            историей повторений.
          </p>
          {paused ? (
            <p className="small muted">Повторения этих заметок приостановлены.</p>
          ) : (
            <div>
              <button className="btn btn--sm" type="button" disabled={pausing} onClick={pauseMissing}>
                Приостановить их повторения
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

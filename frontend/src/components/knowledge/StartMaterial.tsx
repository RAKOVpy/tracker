import { Link } from 'react-router-dom';
import type { StartCheck } from '../../domain/load';
import { plural } from '../../lib/format';

/** Почему новый материал лучше не начинать — по одной фразе на причину. */
function reasons(check: StartCheck): string[] {
  const result: string[] = [];
  if (check.blockers.includes('limit')) {
    const titles = check.active.map((m) => `«${m.title}»`).join(', ');
    result.push(
      `Вы уже изучаете ${check.active.length} ${plural(check.active.length, ['материал', 'материала', 'материалов'])} при лимите ${check.limit}: ${titles}. Когда начато много всего, ни одно не двигается.`,
    );
  }
  if (check.blockers.includes('debt')) {
    const { overdue, budget } = check.load;
    result.push(
      `С прошлых дней ждут повторения ${overdue} ${plural(overdue, ['заметка', 'заметки', 'заметок'])} — больше дневного лимита (${budget}). Новый материал принесёт новые заметки, а старые тем временем забываются.`,
    );
  }
  return result;
}

function strictHint(check: StartCheck): string {
  const what = [
    check.blockers.includes('limit') && 'закончите или отложите один из материалов',
    check.blockers.includes('debt') && 'разберёте долг повторений',
  ].filter(Boolean);
  return `Включён строгий режим: начать можно, когда ${what.join(' и ')}.`;
}

interface ConfirmProps {
  check: StartCheck;
  busy?: boolean;
  onStart: () => void;
  /** Нет, если материал уже в очереди. */
  onQueue?: () => void;
  onCancel: () => void;
}

/** Осознанный старт: объясняем, почему лучше подождать, и даём выбор. */
export function StartMaterialConfirm({ check, busy, onStart, onQueue, onCancel }: ConfirmProps) {
  return (
    <div className="confirm confirm--soft" role="alertdialog" aria-label="Начать изучать материал?">
      {reasons(check).map((text) => (
        <p key={text}>{text}</p>
      ))}
      {check.strict && (
        <p className="small">
          {strictHint(check)} Выключить его можно в <Link to="/settings#load">настройках</Link>.
        </p>
      )}
      <div className="row">
        {onQueue && (
          <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={onQueue}>
            В «Хочу изучить»
          </button>
        )}
        {!check.strict && (
          <button className="btn btn--sm" type="button" disabled={busy} onClick={onStart}>
            Всё равно начать
          </button>
        )}
        <button className="btn btn--sm btn--ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/** Подсказка в форме материала, когда выбран статус «Изучаю», а лимит заполнен или есть долг. */
export function StartMaterialNotice({ check }: { check: StartCheck }) {
  return (
    <div className="notice notice--warn stack" style={{ gap: 6 }}>
      {reasons(check).map((text) => (
        <span key={text}>{text}</span>
      ))}
      <span>
        {check.strict
          ? `${strictHint(check)} Пока материал можно поставить в «Хочу изучить».`
          : 'Лучше поставить материал в «Хочу изучить». Если он правда нужен сейчас — оставьте «Изучаю».'}
      </span>
    </div>
  );
}

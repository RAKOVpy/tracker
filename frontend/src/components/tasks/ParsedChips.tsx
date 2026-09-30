import { CalendarClock, CalendarDays, Flag, FolderKanban, Repeat, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAreaMap, useProjectMap } from '../../api/hooks';
import type { ParsedTask, TokenKind } from '../../domain/parseTask';
import { describeRecurrence } from '../../domain/recurrence';
import { formatShort, type IsoDate } from '../../lib/dates';
import { deadlineTag, planTag } from './taskText';

interface Props {
  parsed: ParsedTask;
  today: IsoDate;
  onDismiss: (fragment: string) => void;
}

/** Что распознано в тексте: «до пт», «важно», «Учёба». Крестик оставляет фрагмент в названии. */
export function ParsedChips({ parsed, today, onDismiss }: Props) {
  const areas = useAreaMap();
  const projects = useProjectMap();
  if (parsed.tokens.length === 0) return null;
  const hasPlanToken = parsed.tokens.some((t) => t.kind === 'plan');

  const content: Record<TokenKind, () => { icon: ReactNode; label: string }> = {
    plan: () => ({
      icon: <CalendarDays size={13} aria-hidden />,
      label: `когда: ${parsed.plannedDate ? (planTag(parsed.plannedDate, today) ?? 'сегодня') : '—'}`,
    }),
    deadline: () => ({
      icon: <CalendarClock size={13} aria-hidden />,
      label: parsed.deadline ? deadlineTag(parsed.deadline, today).text : 'срок',
    }),
    repeat: () => {
      const rule = parsed.recurrence;
      const first = parsed.plannedDate ?? parsed.deadline;
      const text = rule ? describeRecurrence(rule) : 'повтор';
      // Без явной даты задача встаёт на первый повтор — покажем, когда он.
      return { icon: <Repeat size={13} aria-hidden />, label: !hasPlanToken && first ? `${text}, с ${formatShort(first)}` : text };
    },
    important: () => ({ icon: <Flag size={13} aria-hidden />, label: 'важно' }),
    area: () => {
      const area = parsed.areaId ? areas.get(parsed.areaId) : undefined;
      return { icon: <span className={`nav__dot tone-${area?.color ?? 'stone'}`} aria-hidden />, label: area?.name ?? 'сфера' };
    },
    project: () => ({
      icon: <FolderKanban size={13} aria-hidden />,
      label: (parsed.projectId && projects.get(parsed.projectId)?.title) || 'проект',
    }),
  };

  return (
    <ul className="parsed" aria-label="Распознано в тексте">
      {parsed.tokens.map((token) => {
        const { icon, label } = content[token.kind]();
        return (
          <li key={`${token.kind}:${token.text}`} className={`parsed__chip parsed__chip--${token.kind}`}>
            {icon}
            <span>{label}</span>
            <button
              type="button"
              className="parsed__dismiss"
              aria-label={`Не распознавать «${token.text}»`}
              title={`Оставить «${token.text}» в названии`}
              onClick={() => onDismiss(token.text)}
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

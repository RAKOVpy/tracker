import { Link } from 'react-router-dom';
import { LEVELS, type NoteWithState } from '../../domain/review';
import type { MasteryLevel } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';
import { formatDue } from './format';

/** Пять делений: сколько ступеней лестницы освоения пройдено. */
export function LevelMeter({ level }: { level: MasteryLevel }) {
  return (
    <span className="level-meter" title={`Уровень ${level} из 5: ${LEVELS[level].label}`}>
      <span className="visually-hidden">
        Уровень {level} из 5: {LEVELS[level].label}
      </span>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= level ? 'level-meter__step level-meter__step--on' : 'level-meter__step'} aria-hidden />
      ))}
    </span>
  );
}

export function LevelLadder({ level }: { level: MasteryLevel }) {
  return (
    <ol className="ladder">
      {([1, 2, 3, 4, 5] as MasteryLevel[]).map((n) => (
        <li key={n} className={n < level ? 'ladder__step done' : n === level ? 'ladder__step now' : 'ladder__step'}>
          <span className="ladder__n">{n}</span>
          <div>
            <b>{LEVELS[n].label}</b>
            <p>{LEVELS[n].hint}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function NoteRow({ item, today, materialTitle }: { item: NoteWithState; today: IsoDate; materialTitle?: string }) {
  const { note, state } = item;
  const paused = note.status === 'paused';
  return (
    <li className="note-row">
      <div className="note-row__main">
        <Link to={`/knowledge/notes/${note.id}`} className="note-row__title">
          {note.title}
        </Link>
        <div className="note-row__meta">
          {materialTitle && <span>{materialTitle}</span>}
          <span>{LEVELS[state.level].label}</span>
        </div>
      </div>
      <LevelMeter level={state.level} />
      <span className={item.isDue ? 'note-row__due note-row__due--now' : 'note-row__due'}>
        {paused ? 'на паузе' : formatDue(state.dueDate, today)}
      </span>
    </li>
  );
}

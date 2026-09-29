import type { ReactNode } from 'react';
import { useKnowledge, useUpdateSettings } from '../api/hooks';
import { describeBudget, SETTINGS_RANGES } from '../domain/load';
import type { Settings } from '../domain/types';
import { plural } from '../lib/format';
import { NumberStepper } from './NumberStepper';

type NumberKey = keyof typeof SETTINGS_RANGES;

interface RowProps {
  field: NumberKey;
  label: string;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  children: ReactNode;
}

function StepperRow({ field, label, settings, onChange, children }: RowProps) {
  const id = `setting-${field}`;
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <label className="setting-row__label" htmlFor={id}>
          {label}
        </label>
        <div className="muted small">{children}</div>
      </div>
      <NumberStepper
        id={id}
        label={label.toLowerCase()}
        value={settings[field]}
        min={SETTINGS_RANGES[field].min}
        max={SETTINGS_RANGES[field].max}
        onChange={(value) => onChange({ [field]: value })}
      />
    </div>
  );
}

export function LoadSettings() {
  const { data } = useKnowledge();
  const update = useUpdateSettings();
  if (!data) return null;

  const { settings, forecast, materials, load } = data;
  const workDays = forecast.filter((d) => !d.vacation);
  const average = workDays.length ? Math.round(workDays.reduce((sum, d) => sum + d.reviews, 0) / workDays.length) : 0;
  const active = materials.filter((m) => m.status === 'active').length;
  const rowProps = { settings, onChange: (patch: Partial<Settings>) => update.mutate(patch) };

  return (
    <div className="setting-list">
      <StepperRow field="dailyReviewLimit" label="Повторений в день" {...rowProps}>
        {describeBudget(settings.dailyReviewLimit)}. Остальные заметки переносятся на следующие дни, поэтому после пропуска
        не бывает завала.
        {data.notes.length > 0 && ` По прогнозу на 2 недели — в среднем ${average} в день.`}
      </StepperRow>

      <StepperRow field="activeMaterialsLimit" label="Изучать одновременно" {...rowProps}>
        Материалов в «Изучаю» — сейчас {active}. Новые ждут в «Хочу изучить»: так каждый материал двигается, а не висит
        начатым.
      </StepperRow>

      <StepperRow field="newNotesPerDay" label="Новых заметок из Obsidian в день" {...rowProps}>
        Если при синхронизации новых заметок больше, их первые повторения распределяются по дням.
      </StepperRow>

      <div className="setting-row">
        <div className="setting-row__text">
          <label className="checkbox setting-row__label" htmlFor="setting-strict">
            <input
              id="setting-strict"
              type="checkbox"
              checked={settings.strictMode}
              onChange={(e) => update.mutate({ strictMode: e.target.checked })}
            />
            <span>Строгий режим</span>
          </label>
          <div className="muted small">
            Долг — это когда с прошлых дней ждёт больше заметок, чем лимит в день
            {load.overdue > 0 && ` (сейчас ждут ${load.overdue} ${plural(load.overdue, ['заметка', 'заметки', 'заметок'])})`}.
            При долге или заполненном «Изучаю» новый материал начинается только осознанно — кнопкой «Всё равно начать». В
            строгом режиме такой кнопки нет: сначала нужно разобрать долг или освободить место.
          </div>
        </div>
      </div>
    </div>
  );
}

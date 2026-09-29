import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AreaSettings } from '../components/AreaSettings';
import { DataSettings } from '../components/DataSettings';
import { LoadSettings } from '../components/LoadSettings';
import { ObsidianSettings } from '../components/obsidian/ObsidianSettings';
import { VacationSettings } from '../components/VacationSettings';

export function SettingsPage() {
  const { hash } = useLocation();

  // Ссылки /settings#obsidian, #load, #vacation ведут сразу к нужному разделу.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <>
      <div className="page-head">
        <h1>Настройки</h1>
      </div>

      <section className="card settings-section" aria-labelledby="settings-areas">
        <div>
          <h2 id="settings-areas">Сферы жизни</h2>
          <p className="muted small">
            Сферы группируют цели и материалы для изучения: чтение, английский, спорт. Позже к ним добавятся задачи.
          </p>
        </div>
        <AreaSettings />
      </section>

      <section className="card settings-section" id="load" aria-labelledby="settings-load">
        <div>
          <h2 id="settings-load">Нагрузка</h2>
          <p className="muted small">
            Мягкие лимиты: лишние повторения переносятся на следующие дни, а новый материал при перегрузке начинается только
            осознанно. Так учёба не копится лавиной.
          </p>
        </div>
        <LoadSettings />
      </section>

      <section className="card settings-section" id="vacation" aria-labelledby="settings-vacation">
        <div>
          <h2 id="settings-vacation">Отпуск</h2>
          <p className="muted small">
            В отпуске повторения на паузе, а дни отпуска не считаются в расписании: после возвращения заметок будет столько
            же, сколько перед отъездом. Серии по целям не прерываются, сроки целей остаются прежними. Отпуск можно отметить
            и задним числом — например, дни болезни.
          </p>
        </div>
        <VacationSettings />
      </section>

      <section className="card settings-section" id="obsidian" aria-labelledby="settings-obsidian">
        <div>
          <h2 id="settings-obsidian">Obsidian</h2>
          <p className="muted small">Заметки для повторения можно вести в Obsidian — трекер будет забирать их оттуда.</p>
        </div>
        <ObsidianSettings />
      </section>

      <section className="card settings-section" aria-labelledby="settings-data">
        <div>
          <h2 id="settings-data">Данные</h2>
          <p className="muted small">Резервная копия — это файл JSON со всеми целями, заметками, повторениями и сферами.</p>
        </div>
        <DataSettings />
      </section>
    </>
  );
}

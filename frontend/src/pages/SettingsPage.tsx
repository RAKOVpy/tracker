import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AreaSettings } from '../components/AreaSettings';
import { DataSettings } from '../components/DataSettings';
import { ObsidianSettings } from '../components/obsidian/ObsidianSettings';

export function SettingsPage() {
  const { hash } = useLocation();

  // Ссылка /settings#obsidian ведёт сразу к нужному разделу.
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

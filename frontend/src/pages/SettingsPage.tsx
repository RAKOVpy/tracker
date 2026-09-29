import { AreaSettings } from '../components/AreaSettings';
import { DataSettings } from '../components/DataSettings';

export function SettingsPage() {
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

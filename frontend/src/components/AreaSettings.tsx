import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAreas, useCreateArea, useDeleteArea, useGoalsWithStats, useKnowledge, useUpdateArea } from '../api/hooks';
import { AREA_COLORS } from '../domain/meta';
import type { Area, AreaInput } from '../domain/types';
import { plural } from '../lib/format';
import { AreaMark } from './AreaIcon';
import { AreaEditor } from './AreaEditor';

type Mode = { kind: 'idle' } | { kind: 'create' } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };

function nextColor(areas: Area[]): AreaInput['color'] {
  const used = new Set(areas.map((a) => a.color));
  return AREA_COLORS.find((c) => !used.has(c)) ?? 'stone';
}

export function AreaSettings() {
  const { data: areas, isLoading, error } = useAreas();
  const { data: goals } = useGoalsWithStats();
  const { data: knowledge } = useKnowledge();
  const createArea = useCreateArea();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });

  if (isLoading) return <p className="muted">Загрузка…</p>;
  if (error || !areas) return <p className="notice notice--bad">Не удалось загрузить сферы.</p>;

  const list: Area[] = areas;
  const goalCount = (areaId: string) => goals?.filter((g) => g.goal.areaId === areaId).length ?? 0;
  const materialCount = (areaId: string) => knowledge?.materials.filter((m) => m.areaId === areaId).length ?? 0;

  /** «2 цели и 1 материал» — что лежит в сфере. */
  function describeContents(areaId: string): string | null {
    const g = goalCount(areaId);
    const m = materialCount(areaId);
    const parts = [
      g > 0 ? `${g} ${plural(g, ['цель', 'цели', 'целей'])}` : null,
      m > 0 ? `${m} ${plural(m, ['материал', 'материала', 'материалов'])}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' и ') : null;
  }

  /** Меняет местами соседние сферы. */
  async function move(index: number, direction: -1 | 1) {
    const a = list[index];
    const b = list[index + direction];
    if (!b) return;
    await updateArea.mutateAsync({ id: a.id, patch: { order: b.order } });
    await updateArea.mutateAsync({ id: b.id, patch: { order: a.order } });
  }

  return (
    <div className="stack">
      {areas.length === 0 && mode.kind !== 'create' && <p className="muted">Сфер пока нет.</p>}

      <ul className="area-list">
        {areas.map((area, index) => {
          if (mode.kind === 'edit' && mode.id === area.id) {
            return (
              <li key={area.id} className="area-row" style={{ display: 'block' }}>
                <AreaEditor
                  initial={{ name: area.name, color: area.color, icon: area.icon }}
                  submitLabel="Сохранить"
                  isSubmitting={updateArea.isPending}
                  onSubmit={(input) =>
                    updateArea.mutate({ id: area.id, patch: input }, { onSuccess: () => setMode({ kind: 'idle' }) })
                  }
                  onCancel={() => setMode({ kind: 'idle' })}
                />
              </li>
            );
          }

          const contents = describeContents(area.id);
          if (mode.kind === 'delete' && mode.id === area.id) {
            return (
              <li key={area.id} className="area-row" style={{ display: 'block' }}>
                <div className="confirm">
                  <p>
                    Удалить сферу «{area.name}»?{' '}
                    {contents
                      ? `${contents} останутся без сферы, сами они не удалятся.`
                      : 'В ней ничего нет.'}
                  </p>
                  <div className="row">
                    <button
                      className="btn btn--sm btn--danger-solid"
                      type="button"
                      disabled={deleteArea.isPending}
                      onClick={() => deleteArea.mutate(area.id, { onSuccess: () => setMode({ kind: 'idle' }) })}
                    >
                      Удалить сферу
                    </button>
                    <button className="btn btn--sm" type="button" onClick={() => setMode({ kind: 'idle' })}>
                      Отмена
                    </button>
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li key={area.id} className="area-row">
              <AreaMark area={area} size="sm" />
              <span className="area-row__name">
                {area.name}
                <span className="muted small num">
                  {' '}
                  · {contents ?? 'пусто'}
                </span>
              </span>
              <button
                className="icon-btn"
                type="button"
                aria-label={`Поднять «${area.name}» выше`}
                disabled={index === 0 || updateArea.isPending}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={16} aria-hidden />
              </button>
              <button
                className="icon-btn"
                type="button"
                aria-label={`Опустить «${area.name}» ниже`}
                disabled={index === areas.length - 1 || updateArea.isPending}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={16} aria-hidden />
              </button>
              <button
                className="icon-btn"
                type="button"
                aria-label={`Изменить «${area.name}»`}
                onClick={() => setMode({ kind: 'edit', id: area.id })}
              >
                <Pencil size={15} aria-hidden />
              </button>
              <button
                className="icon-btn icon-btn--danger"
                type="button"
                aria-label={`Удалить «${area.name}»`}
                onClick={() => setMode({ kind: 'delete', id: area.id })}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {mode.kind === 'create' ? (
        <AreaEditor
          initial={{ name: '', color: nextColor(areas), icon: 'star' }}
          submitLabel="Добавить"
          isSubmitting={createArea.isPending}
          onSubmit={(input) => createArea.mutate(input, { onSuccess: () => setMode({ kind: 'idle' }) })}
          onCancel={() => setMode({ kind: 'idle' })}
        />
      ) : (
        <div>
          <button className="btn btn--sm" type="button" onClick={() => setMode({ kind: 'create' })}>
            <Plus size={15} aria-hidden /> Добавить сферу
          </button>
        </div>
      )}
    </div>
  );
}

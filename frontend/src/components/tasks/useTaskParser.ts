import { useMemo, useState } from 'react';
import { useAreas, useProjects, useToday } from '../../api/hooks';
import { parseTask, type ParsedTask } from '../../domain/parseTask';

/**
 * Разбор текста задачи на лету: «до пт», «!важно», «#учёба». Отменённые фрагменты
 * (крестик на подсказке) остаются в названии; `reset` забывает их — для следующей записи.
 */
export function useTaskParser(text: string, options: { projects?: boolean } = {}) {
  const today = useToday();
  const areas = useAreas();
  const projects = useProjects();
  const withProjects = options.projects ?? true;
  const [ignore, setIgnore] = useState<ReadonlySet<string>>(() => new Set());

  const parsed: ParsedTask = useMemo(
    () =>
      parseTask(text, {
        today,
        areas: areas.data ?? [],
        // Задача проекта на паузе пропала бы из «Сегодня» — предлагаем только проекты в работе.
        projects: withProjects ? (projects.data ?? []).filter((p) => p.status === 'active') : [],
        ignore,
      }),
    [text, today, areas.data, projects.data, withProjects, ignore],
  );

  return {
    parsed,
    dismiss: (fragment: string) => setIgnore((prev) => new Set(prev).add(fragment)),
    reset: () => setIgnore(new Set()),
  };
}

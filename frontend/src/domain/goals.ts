import type { Goal, GoalPatch } from './types';

/**
 * Правка цели. Вид после создания не меняется: у цели к сроку всегда есть срок и нет частоты,
 * у привычки — наоборот, поэтому поля другого вида из правки отбрасываются.
 */
export function applyGoalPatch(goal: Goal, patch: GoalPatch): Goal {
  const { deadline, daysPerWeek, ...common } = patch;
  if (goal.kind === 'target') return { ...goal, ...common, deadline: deadline ?? goal.deadline };
  return { ...goal, ...common, daysPerWeek: daysPerWeek ?? goal.daysPerWeek };
}

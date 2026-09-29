import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAreas, useCreateGoal, useGoalWithStats, useUpdateGoal } from '../api/hooks';
import { GoalForm } from '../components/GoalForm';
import type { GoalInput } from '../domain/types';
import { ErrorState, LoadingState } from './states';

export function NewGoalPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const areas = useAreas();
  const createGoal = useCreateGoal();

  if (areas.isLoading) return <LoadingState />;
  if (areas.error || !areas.data) return <ErrorState error={areas.error} />;

  const requestedArea = params.get('area');
  const defaultAreaId = areas.data.some((a) => a.id === requestedArea) ? requestedArea : null;

  return (
    <>
      <div className="page-head">
        <h1>Новая цель</h1>
      </div>
      <GoalForm
        areas={areas.data}
        defaultAreaId={defaultAreaId}
        submitLabel="Создать цель"
        isSubmitting={createGoal.isPending}
        onSubmit={(input) => createGoal.mutate(input, { onSuccess: (goal) => navigate(`/goals/${goal.id}`) })}
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

export function EditGoalPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const goal = useGoalWithStats(id);
  const areas = useAreas();
  const updateGoal = useUpdateGoal(id);

  if (goal.isLoading || areas.isLoading) return <LoadingState />;
  if (areas.error || !areas.data) return <ErrorState error={areas.error} />;
  if (!goal.data) return <ErrorState error={goal.error ?? new Error('Цель не найдена')} />;

  const { goal: g } = goal.data;
  const initial: GoalInput = {
    title: g.title,
    description: g.description,
    areaId: g.areaId,
    unit: g.unit,
    targetValue: g.targetValue,
    startDate: g.startDate,
    deadline: g.deadline,
    priority: g.priority,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-head__eyebrow">Редактирование</p>
          <h1>{g.title}</h1>
        </div>
      </div>
      <GoalForm
        areas={areas.data}
        initial={initial}
        submitLabel="Сохранить"
        isSubmitting={updateGoal.isPending}
        onSubmit={(input) => updateGoal.mutate(input, { onSuccess: () => navigate(`/goals/${id}`) })}
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

import { useNavigate, useParams } from 'react-router-dom';
import { useCreateGoal, useGoalWithStats, useUpdateGoal } from '../api/hooks';
import { GoalForm } from '../components/GoalForm';
import type { GoalInput } from '../domain/types';

export function NewGoalPage() {
  const navigate = useNavigate();
  const createGoal = useCreateGoal();

  return (
    <>
      <div className="page-head">
        <h1>Новая цель</h1>
      </div>
      <GoalForm
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
  const { data, isLoading } = useGoalWithStats(id);
  const updateGoal = useUpdateGoal(id);

  if (isLoading) return <p className="muted">Загрузка…</p>;
  if (!data) return <p className="field__error">Цель не найдена</p>;

  const { goal } = data;
  const initial: GoalInput = {
    title: goal.title,
    description: goal.description,
    category: goal.category,
    unit: goal.unit,
    targetValue: goal.targetValue,
    startDate: goal.startDate,
    deadline: goal.deadline,
    priority: goal.priority,
  };

  return (
    <>
      <div className="page-head">
        <h1>Редактирование</h1>
      </div>
      <GoalForm
        initial={initial}
        submitLabel="Сохранить"
        isSubmitting={updateGoal.isPending}
        onSubmit={(input) => updateGoal.mutate(input, { onSuccess: () => navigate(`/goals/${id}`) })}
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

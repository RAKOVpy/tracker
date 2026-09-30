"""
Правила изменения данных, которые не укладываются в одно поле: закрытие задачи с повтором,
вложенные вехи и части. Повторяют domain/tasks.ts и domain/projects.ts на фронтенде.
"""

import uuid
from collections.abc import Iterable
from datetime import date, datetime

from django.db import models

from .models import Task, TaskStatus
from .rules.recurrence import next_dates, parse_rule

CLOSED_TASK = {TaskStatus.DONE, TaskStatus.CANCELLED}
CLOSED_PROJECT = {"done", "dropped"}


def task_closed(status: str) -> bool:
    return status in CLOSED_TASK


def next_repeat(task: Task, today: date, now: datetime) -> Task:
    """Следующий повтор закрытой задачи: открытая копия с датами на следующий раз и неотмеченными подзадачами."""
    planned, deadline = next_dates(parse_rule(task.recurrence), task.planned_date, task.deadline, today)
    return Task.objects.create(
        user_id=task.user_id,
        title=task.title,
        notes=task.notes,
        status=TaskStatus.TODO,
        important=task.important,
        deadline=deadline,
        planned_date=planned,
        area_id=task.area_id,
        project_id=task.project_id,
        milestone_id=task.milestone_id,
        material_id=task.material_id,
        part_id=task.part_id,
        checklist=[{**item, "done": False} for item in task.checklist],
        recurrence=task.recurrence,
        repeat_of=task,
        completed_at=None,
        created_at=now,
    )


def _untouched(next_task: Task, task: Task) -> bool:
    """Следующий повтор не трогали: открыт, те же название и заметки, подзадачи не отмечены."""
    return (
        next_task.status == TaskStatus.TODO
        and next_task.title == task.title
        and next_task.notes == task.notes
        and not any(item.get("done") for item in next_task.checklist)
    )


def update_task(task: Task, changes: dict, today: date, now: datetime) -> Task:
    """
    Изменение задачи вместе с её повторами (applyTaskUpdate на фронтенде):
    - при закрытии запоминается время, при возврате в работу — сбрасывается;
    - закрыли повторяющуюся задачу — появляется следующий повтор;
    - вернули в работу — нетронутый следующий повтор убирается и серия продолжается этой задачей,
      а тронутый остаётся, и эта задача становится разовой.
    Вызывать внутри транзакции, задачу — заблокировать (select_for_update).
    """
    was_closed = task_closed(task.status)
    for field, value in changes.items():
        setattr(task, field, value)
    closed = task_closed(task.status)
    if was_closed != closed:
        task.completed_at = now if closed else None
    task.save()

    next_task = Task.objects.filter(repeat_of=task).first()
    if task.recurrence and closed and not was_closed and next_task is None:
        next_repeat(task, today, now)
    elif task.recurrence and was_closed and not closed and next_task is not None:
        if _untouched(next_task, task):
            next_task.delete()
        else:
            task.recurrence = None
            task.save(update_fields=["recurrence"])
    return task


def sync_children(parent: models.Model, fk: str, model: type[models.Model], items: Iterable[dict]) -> None:
    """
    Вложенный список (вехи проекта, части материала) приводится к присланному: порядок — по списку,
    известные id обновляются, новые создаются, пропавшие удаляются (задачи их теряют через SET_NULL).
    Новые id присылает фронтенд; занятый чужим объектом id заменяется новым.
    """
    existing = {child.id: child for child in model.objects.filter(**{fk: parent})}
    keep: set[uuid.UUID] = set()
    for order, item in enumerate(items):
        fields = {key: value for key, value in item.items() if key != "id"}
        child_id = item.get("id")
        child = existing.get(child_id) if child_id is not None else None
        if child is not None:
            for key, value in fields.items():
                setattr(child, key, value)
            child.order = order
            child.save()
        else:
            if child_id is None or model.objects.filter(id=child_id).exists():
                child_id = uuid.uuid4()
            child = model.objects.create(id=child_id, order=order, **{fk: parent}, **fields)
        keep.add(child.id)
    model.objects.filter(**{fk: parent}).exclude(id__in=keep).delete()

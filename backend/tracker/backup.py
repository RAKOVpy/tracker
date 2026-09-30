"""
Резервная копия в формате фронтенда (api/schema.ts, версия 8): выгрузка, загрузка, сброс,
а также запись результата синхронизации с Obsidian.

Загрузка проверяет данные так же, как validateDb на фронтенде, и чинит висячие ссылки.
Все id при загрузке заменяются новыми: UUID общий для всех пользователей, а одну и ту же копию
могут загрузить два аккаунта. Ссылки между объектами переводятся на новые id.
"""

import uuid
from datetime import date, datetime
from datetime import timezone as dt_timezone

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .defaults import DEFAULT_SETTINGS, SETTINGS_RANGES, create_default_areas, user_settings
from .models import (
    Area,
    AreaColor,
    AreaIcon,
    Explain,
    Goal,
    GoalStatus,
    Material,
    MaterialPart,
    MaterialStatus,
    MaterialType,
    Milestone,
    Note,
    NoteStatus,
    PartStatus,
    Priority,
    ProgressEntry,
    Project,
    ProjectStatus,
    Rating,
    Review,
    Task,
    TaskStatus,
    Vacation,
)
from .rules.recurrence import RuleError, parse_rule
from .serializers import (
    AreaSerializer,
    EntrySerializer,
    GoalSerializer,
    MaterialSerializer,
    NoteSerializer,
    ProjectSerializer,
    ReviewSerializer,
    SettingsSerializer,
    TaskSerializer,
    VacationSerializer,
)

SCHEMA_VERSION = 8


class DataError(ValueError):
    """Данные резервной копии не прошли проверку. Текст — для пользователя."""


# ---------- выгрузка ----------


def export_data(request) -> dict:
    user = request.user
    ctx = {"request": request}

    def many(serializer, queryset):
        return serializer(queryset, many=True, context=ctx).data

    return {
        "app": "tracker",
        "version": SCHEMA_VERSION,
        "exported_at": timezone.now().isoformat().replace("+00:00", "Z"),
        "areas": many(AreaSerializer, Area.objects.filter(user=user)),
        "goals": many(GoalSerializer, Goal.objects.filter(user=user)),
        "entries": many(EntrySerializer, ProgressEntry.objects.filter(goal__user=user)),
        "materials": many(MaterialSerializer, Material.objects.filter(user=user).prefetch_related("parts")),
        "notes": many(NoteSerializer, Note.objects.filter(user=user)),
        "reviews": many(ReviewSerializer, Review.objects.filter(note__user=user)),
        "settings": SettingsSerializer(user_settings(user), context=ctx).data,
        "vacations": many(VacationSerializer, Vacation.objects.filter(user=user)),
        "tasks": many(TaskSerializer, Task.objects.filter(user=user)),
        "projects": many(ProjectSerializer, Project.objects.filter(user=user).prefetch_related("milestones")),
    }


# ---------- проверка ----------


def _obj(value, where: str) -> dict:
    if not isinstance(value, dict):
        raise DataError(f"Ожидался объект: {where}")
    return value


def _list(value, where: str) -> list:
    if not isinstance(value, list):
        raise DataError(f"Ожидался список: {where}")
    return value


def _str(obj: dict, key: str, where: str, *, allow_empty: bool = False, max_length: int | None = None) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise DataError(f"{where}: поле «{key}» должно быть непустой строкой")
    if max_length is not None and len(value) > max_length:
        raise DataError(f"{where}: поле «{key}» длиннее {max_length} символов")
    return value


def _optional_str(obj: dict, key: str, where: str) -> str | None:
    return None if obj.get(key) is None else _str(obj, key, where)


def _num(obj: dict, key: str, where: str) -> float:
    value = obj.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
        raise DataError(f"{where}: поле «{key}» должно быть числом")
    return value


def _bool(obj: dict, key: str, where: str) -> bool:
    value = obj.get(key)
    if not isinstance(value, bool):
        raise DataError(f"{where}: поле «{key}» должно быть true или false")
    return value


def _date(obj: dict, key: str, where: str) -> date:
    value = obj.get(key)
    try:
        if isinstance(value, str) and len(value) == 10:
            return date.fromisoformat(value)
    except ValueError:
        pass
    raise DataError(f"{where}: поле «{key}» должно быть датой ГГГГ-ММ-ДД")


def _optional_date(obj: dict, key: str, where: str) -> date | None:
    return None if obj.get(key) is None else _date(obj, key, where)


def _one_of(obj: dict, key: str, allowed, where: str) -> str:
    value = obj.get(key)
    if value not in allowed.values:
        raise DataError(f"{where}: недопустимое значение поля «{key}»")
    return value


def _moment(obj: dict, key: str) -> datetime | None:
    """Дата-время из копии; нераспознанное — None (такое поле не критично)."""
    value = obj.get(key)
    parsed = parse_datetime(value) if isinstance(value, str) else None
    if parsed is not None and timezone.is_naive(parsed):
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed


class IdMap:
    """Старые id из копии → новые UUID. Повтор id внутри одного списка — ошибка, как на фронтенде."""

    def __init__(self, what: str):
        self.what = what
        self.ids: dict[str, uuid.UUID] = {}

    def add(self, old: str) -> uuid.UUID:
        if old in self.ids:
            raise DataError(f"{self.what}: повторяется id {old}")
        self.ids[old] = uuid.uuid4()
        return self.ids[old]

    def get(self, old) -> uuid.UUID | None:
        """Ссылка на объект; висячая — None."""
        return self.ids.get(old) if isinstance(old, str) else None


def clean_material(m: dict, where: str, areas: IdMap) -> dict:
    return {
        "title": _str(m, "title", where, max_length=500),
        "type": _one_of(m, "type", MaterialType, where),
        "author": _str(m, "author", where, allow_empty=True, max_length=300),
        "url": _str(m, "url", where, allow_empty=True, max_length=2000),
        "area_id": areas.get(m.get("area_id")),
        "status": _one_of(m, "status", MaterialStatus, where),
        "obsidian_path": _optional_str(m, "obsidian_path", where),
    }


def clean_note(n: dict, where: str, materials: IdMap) -> dict:
    questions = _list(n.get("questions"), f"{where}: questions")
    if any(not isinstance(q, str) for q in questions):
        raise DataError(f"{where}: поле «questions» должно быть списком строк")
    uri = _str(n, "obsidian_uri", where, allow_empty=True, max_length=2000)
    if uri and not uri.startswith("obsidian://"):
        raise DataError(f"{where}: ссылка на Obsidian должна начинаться с obsidian://")
    return {
        "title": _str(n, "title", where, max_length=500),
        "material_id": materials.get(n.get("material_id")),
        "questions": questions,
        "summary": _str(n, "summary", where, allow_empty=True),
        "obsidian_uri": uri,
        "status": _one_of(n, "status", NoteStatus, where),
        "added_on": _date(n, "added_on", where),
        "obsidian_path": _optional_str(n, "obsidian_path", where),
    }


# ---------- загрузка ----------


@transaction.atomic
def import_data(user, raw) -> None:
    """Полностью заменяет данные пользователя данными из копии текущей версии схемы."""
    data = _obj(raw, "data")
    if data.get("version") != SCHEMA_VERSION:
        raise DataError("Копия другой версии: приложение переводит её в текущую перед загрузкой. Обновите страницу.")
    now = timezone.now()
    created = lambda obj: _moment(obj, "created_at") or now  # noqa: E731

    area_ids = IdMap("Сферы")
    areas = []
    for i, item in enumerate(_list(data.get("areas"), "areas"), start=1):
        a, where = _obj(item, f"Сфера {i}"), f"Сфера {i}"
        areas.append(
            Area(
                id=area_ids.add(_str(a, "id", where)),
                user=user,
                name=_str(a, "name", where, max_length=100),
                color=_one_of(a, "color", AreaColor, where),
                icon=_one_of(a, "icon", AreaIcon, where),
                order=int(_num(a, "order", where)),
                created_at=created(a),
            )
        )

    goal_ids = IdMap("Цели")
    goals = []
    for i, item in enumerate(_list(data.get("goals"), "goals"), start=1):
        g, where = _obj(item, f"Цель {i}"), f"Цель {i}"
        goal = Goal(
            id=goal_ids.add(_str(g, "id", where)),
            user=user,
            title=_str(g, "title", where, max_length=500),
            description=_str(g, "description", where, allow_empty=True),
            area_id=area_ids.get(g.get("area_id")),
            unit=_str(g, "unit", where, max_length=50),
            target_value=_num(g, "target_value", where),
            start_date=_date(g, "start_date", where),
            deadline=_date(g, "deadline", where),
            priority=_one_of(g, "priority", Priority, where),
            status=_one_of(g, "status", GoalStatus, where),
            created_at=created(g),
        )
        if goal.target_value <= 0:
            raise DataError(f"{where}: цель должна быть больше нуля")
        if goal.deadline < goal.start_date:
            raise DataError(f"{where}: дедлайн раньше даты старта")
        goals.append(goal)

    entries = []
    entry_ids = IdMap("Записи")
    for i, item in enumerate(_list(data.get("entries"), "entries"), start=1):
        e, where = _obj(item, f"Запись {i}"), f"Запись {i}"
        entry_id = entry_ids.add(_str(e, "id", where))
        value = _num(e, "value", where)
        if value <= 0:
            raise DataError(f"{where}: значение должно быть больше нуля")
        entry = ProgressEntry(
            id=entry_id,
            goal_id=goal_ids.get(e.get("goal_id")),
            date=_date(e, "date", where),
            value=value,
            note=_str(e, "note", where, allow_empty=True),
            created_at=created(e),
        )
        # Записи удалённой цели отбрасываются.
        if entry.goal_id is not None:
            entries.append(entry)

    material_ids = IdMap("Материалы")
    materials, parts = [], []
    # id частей уникальны внутри материала — как вехи внутри проекта.
    parts_of: dict[uuid.UUID, IdMap] = {}
    for i, item in enumerate(_list(data.get("materials"), "materials"), start=1):
        m, where = _obj(item, f"Материал {i}"), f"Материал {i}"
        material_id = material_ids.add(_str(m, "id", where))
        materials.append(Material(id=material_id, user=user, created_at=created(m), **clean_material(m, where, area_ids)))
        part_ids = parts_of[material_id] = IdMap(f"{where}: части")
        for j, raw_part in enumerate(_list(m.get("parts"), f"{where}: parts"), start=1):
            p, at = _obj(raw_part, f"{where}, часть {j}"), f"{where}, часть {j}"
            parts.append(
                MaterialPart(
                    id=part_ids.add(_str(p, "id", at)),
                    material_id=material_id,
                    title=_str(p, "title", at, max_length=500),
                    status=_one_of(p, "status", PartStatus, at),
                    order=j - 1,
                )
            )

    note_ids = IdMap("Заметки")
    notes = []
    for i, item in enumerate(_list(data.get("notes"), "notes"), start=1):
        n, where = _obj(item, f"Заметка {i}"), f"Заметка {i}"
        notes.append(Note(id=note_ids.add(_str(n, "id", where)), user=user, created_at=created(n), **clean_note(n, where, material_ids)))

    reviews = []
    review_ids = IdMap("Повторения")
    for i, item in enumerate(_list(data.get("reviews"), "reviews"), start=1):
        r, where = _obj(item, f"Повторение {i}"), f"Повторение {i}"
        review = Review(
            id=review_ids.add(_str(r, "id", where)),
            note_id=note_ids.get(r.get("note_id")),
            date=_date(r, "date", where),
            rating=_one_of(r, "rating", Rating, where),
            explain=None if r.get("explain") is None else _one_of(r, "explain", Explain, where),
            taught=_bool(r, "taught", where),
            created_at=created(r),
        )
        # Повторения удалённой заметки отбрасываются.
        if review.note_id is not None:
            reviews.append(review)

    raw_settings = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    settings_values = dict(DEFAULT_SETTINGS)
    # Настройки не критичны: вне диапазона — к ближайшему допустимому, неизвестное — по умолчанию.
    for key, (low, high) in SETTINGS_RANGES.items():
        value = raw_settings.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and abs(value) != float("inf"):
            settings_values[key] = min(high, max(low, round(value)))
    if isinstance(raw_settings.get("strict_mode"), bool):
        settings_values["strict_mode"] = raw_settings["strict_mode"]

    vacations = []
    vacation_ids = IdMap("Отпуска")
    for i, item in enumerate(_list(data.get("vacations"), "vacations"), start=1):
        v, where = _obj(item, f"Отпуск {i}"), f"Отпуск {i}"
        vacation = Vacation(
            id=vacation_ids.add(_str(v, "id", where)),
            user=user,
            start=_date(v, "start", where),
            end=_optional_date(v, "end", where),
            created_at=created(v),
        )
        if vacation.end is not None and vacation.end < vacation.start:
            raise DataError(f"{where}: отпуск заканчивается раньше, чем начинается")
        vacations.append(vacation)
    vacations.sort(key=lambda v: v.start)
    for current, following in zip(vacations, vacations[1:]):
        if current.end is None or current.end >= following.start:
            raise DataError("Отпуска пересекаются")

    project_ids = IdMap("Проекты")
    projects, milestones = [], []
    milestones_of: dict[uuid.UUID, IdMap] = {}
    for i, item in enumerate(_list(data.get("projects"), "projects"), start=1):
        p, where = _obj(item, f"Проект {i}"), f"Проект {i}"
        project_id = project_ids.add(_str(p, "id", where))
        projects.append(
            Project(
                id=project_id,
                user=user,
                title=_str(p, "title", where, max_length=500),
                description=_str(p, "description", where, allow_empty=True),
                area_id=area_ids.get(p.get("area_id")),
                goal_id=goal_ids.get(p.get("goal_id")),
                status=_one_of(p, "status", ProjectStatus, where),
                deadline=_optional_date(p, "deadline", where),
                completed_at=_moment(p, "completed_at"),
                created_at=created(p),
            )
        )
        milestone_ids = milestones_of[project_id] = IdMap(f"{where}: вехи")
        for j, raw_milestone in enumerate(_list(p.get("milestones"), f"{where}: milestones"), start=1):
            m, at = _obj(raw_milestone, f"{where}, веха {j}"), f"{where}, веха {j}"
            milestones.append(
                Milestone(
                    id=milestone_ids.add(_str(m, "id", at)),
                    project_id=project_id,
                    title=_str(m, "title", at, max_length=500),
                    deadline=_optional_date(m, "deadline", at),
                    order=j - 1,
                )
            )

    task_ids = IdMap("Задачи")
    tasks, repeat_links = [], []
    for i, item in enumerate(_list(data.get("tasks"), "tasks"), start=1):
        t, where = _obj(item, f"Задача {i}"), f"Задача {i}"
        checklist = []
        local = IdMap(f"{where}: пункты")
        for j, raw_item in enumerate(_list(t.get("checklist"), f"{where}: checklist"), start=1):
            c, at = _obj(raw_item, f"{where}, пункт {j}"), f"{where}, пункт {j}"
            item_id = _str(c, "id", at)
            local.add(item_id)
            checklist.append({"id": item_id, "text": _str(c, "text", at), "done": _bool(c, "done", at)})
        recurrence = None
        if t.get("recurrence") is not None:
            try:
                recurrence = parse_rule(t["recurrence"]).to_json()
            except RuleError as error:
                raise DataError(f"{where}, повтор: {error}") from error
        # Веха — только из вех проекта задачи, часть — только из частей её материала.
        project_id = project_ids.get(t.get("project_id"))
        milestone_id = milestones_of[project_id].get(t.get("milestone_id")) if project_id else None
        material_id = material_ids.get(t.get("material_id"))
        part_id = parts_of[material_id].get(t.get("part_id")) if material_id else None
        task_id = task_ids.add(_str(t, "id", where))
        tasks.append(
            Task(
                id=task_id,
                user=user,
                title=_str(t, "title", where, max_length=500),
                notes=_str(t, "notes", where, allow_empty=True),
                status=_one_of(t, "status", TaskStatus, where),
                important=_bool(t, "important", where),
                deadline=_optional_date(t, "deadline", where),
                planned_date=_optional_date(t, "planned_date", where),
                area_id=area_ids.get(t.get("area_id")),
                project_id=project_id,
                milestone_id=milestone_id,
                material_id=material_id,
                part_id=part_id,
                checklist=checklist,
                recurrence=recurrence,
                completed_at=_moment(t, "completed_at"),
                created_at=created(t),
            )
        )
        repeat_links.append((tasks[-1], t.get("repeat_of")))
    # Повтор удалённой задачи просто теряет ссылку на неё.
    for task, old in repeat_links:
        target = task_ids.get(old)
        task.repeat_of_id = target if target != task.id else None

    _delete_all(user)
    Area.objects.bulk_create(areas)
    Goal.objects.bulk_create(goals)
    ProgressEntry.objects.bulk_create(entries)
    Material.objects.bulk_create(materials)
    MaterialPart.objects.bulk_create(parts)
    Note.objects.bulk_create(notes)
    Review.objects.bulk_create(reviews)
    Vacation.objects.bulk_create(vacations)
    Project.objects.bulk_create(projects)
    Milestone.objects.bulk_create(milestones)
    Task.objects.bulk_create(tasks)
    settings = user_settings(user)
    for key, value in settings_values.items():
        setattr(settings, key, value)
    settings.save()


def _delete_all(user) -> None:
    # Записи, повторения, части и вехи удаляются вместе с родителями (CASCADE).
    Task.objects.filter(user=user).delete()
    Project.objects.filter(user=user).delete()
    Note.objects.filter(user=user).delete()
    Material.objects.filter(user=user).delete()
    Goal.objects.filter(user=user).delete()
    Vacation.objects.filter(user=user).delete()
    Area.objects.filter(user=user).delete()


@transaction.atomic
def reset_data(user) -> None:
    """Удаляет всё и создаёт сферы по умолчанию — как «Удалить всё» на фронтенде."""
    _delete_all(user)
    create_default_areas(user)
    settings = user_settings(user)
    for key, value in DEFAULT_SETTINGS.items():
        setattr(settings, key, value)
    settings.save()


# ---------- синхронизация с Obsidian ----------


def _free_id(model, raw) -> uuid.UUID:
    """id нового объекта от фронтенда, если он корректен и не занят; иначе — новый."""
    try:
        value = uuid.UUID(str(raw))
    except ValueError:
        return uuid.uuid4()
    return uuid.uuid4() if model.objects.filter(id=value).exists() else value


@transaction.atomic
def apply_obsidian(user, raw) -> dict:
    """
    Записывает изменённые и новые материалы и заметки, которые фронтенд получил из хранилища Obsidian
    (applyVault в obsidian/sync.ts). Ничего не удаляется. У существующих объектов меняются только поля
    из файла: статус, дата добавления и журнал повторений остаются как были.
    """
    data = _obj(raw, "data")
    areas = IdMap("Сферы")
    areas.ids = {str(a): a for a in Area.objects.filter(user=user).values_list("id", flat=True)}
    materials = IdMap("Материалы")
    materials.ids = {str(m): m for m in Material.objects.filter(user=user).values_list("id", flat=True)}
    existing_materials = set(materials.ids)
    counts = {"materials": 0, "notes": 0}

    for i, item in enumerate(_list(data.get("materials", []), "materials"), start=1):
        m, where = _obj(item, f"Материал {i}"), f"Материал {i}"
        old = _str(m, "id", where)
        fields = clean_material(m, where, areas)
        if old in existing_materials:
            # Статус материала ведётся в трекере.
            fields.pop("status")
            Material.objects.filter(id=materials.ids[old], user=user).update(**fields)
        else:
            material = Material.objects.create(id=_free_id(Material, old), user=user, **fields)
            materials.ids[old] = material.id
        counts["materials"] += 1

    existing_notes = {str(n) for n in Note.objects.filter(user=user).values_list("id", flat=True)}
    for i, item in enumerate(_list(data.get("notes", []), "notes"), start=1):
        n, where = _obj(item, f"Заметка {i}"), f"Заметка {i}"
        old = _str(n, "id", where)
        fields = clean_note(n, where, materials)
        if old in existing_notes:
            for key in ("status", "added_on"):
                fields.pop(key)
            Note.objects.filter(id=old, user=user).update(**fields)
        else:
            Note.objects.create(id=_free_id(Note, old), user=user, **fields)
        counts["notes"] += 1
    return counts

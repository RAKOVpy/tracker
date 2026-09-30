"""
Сериализаторы API. Поля в snake_case, наружу — camelCase (djangorestframework-camel-case),
формат совпадает с типами фронтенда. Ссылки проверяются: сослаться можно только на свои объекты.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .defaults import SETTINGS_RANGES
from .models import (
    Area,
    Goal,
    Material,
    MaterialPart,
    Milestone,
    Note,
    ProgressEntry,
    Project,
    Review,
    Task,
    UserSettings,
    Vacation,
)
from .rules.recurrence import RuleError, parse_rule
from .rules.vacations import vacation_error
from .services import CLOSED_PROJECT, sync_children, task_closed, update_task
from .today import request_today


class OwnedField(serializers.PrimaryKeyRelatedField):
    """Ссылка на объект текущего пользователя. Чужой id ведёт себя как несуществующий."""

    def __init__(self, model, owner: str = "user", **kwargs):
        self.model = model
        self.owner = owner
        kwargs.setdefault("pk_field", serializers.UUIDField())
        super().__init__(**kwargs)

    def get_queryset(self):
        return self.model.objects.filter(**{self.owner: self.context["request"].user})


def optional_ref(model, source: str, owner: str = "user") -> OwnedField:
    return OwnedField(model, owner=owner, source=source, allow_null=True, required=False)


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = ["id", "name", "color", "icon", "order", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"order": {"required": False}}

    def create(self, validated_data):
        user = self.context["request"].user
        if "order" not in validated_data:
            last = Area.objects.filter(user=user).order_by("-order").first()
            validated_data["order"] = last.order + 1 if last else 0
        return Area.objects.create(user=user, **validated_data)


class GoalSerializer(serializers.ModelSerializer):
    area_id = optional_ref(Area, "area")

    class Meta:
        model = Goal
        fields = ["id", "title", "description", "area_id", "unit", "target_value", "start_date", "deadline", "priority", "status", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"description": {"required": False}, "status": {"required": False}}

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if start and deadline and deadline < start:
            raise serializers.ValidationError({"deadline": "Дедлайн раньше даты старта."})
        if "target_value" in attrs and attrs["target_value"] <= 0:
            raise serializers.ValidationError({"target_value": "Цель должна быть больше нуля."})
        return attrs

    def create(self, validated_data):
        return Goal.objects.create(user=self.context["request"].user, **validated_data)


class EntrySerializer(serializers.ModelSerializer):
    goal_id = OwnedField(Goal, source="goal")

    class Meta:
        model = ProgressEntry
        fields = ["id", "goal_id", "date", "value", "note", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"note": {"required": False}}

    def validate_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("Значение должно быть больше нуля.")
        return value


def unique_ids(items: list[dict], what: str) -> None:
    ids = [item["id"] for item in items if item.get("id") is not None]
    if len(ids) != len(set(ids)):
        raise serializers.ValidationError(f"{what}: повторяется id.")


class PartSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    title = serializers.CharField(max_length=500)
    status = serializers.ChoiceField(choices=MaterialPart._meta.get_field("status").choices, default="todo")


class MaterialSerializer(serializers.ModelSerializer):
    area_id = optional_ref(Area, "area")
    parts = PartSerializer(many=True, required=False)

    class Meta:
        model = Material
        fields = ["id", "title", "type", "author", "url", "area_id", "status", "parts", "obsidian_path", "created_at"]
        read_only_fields = ["id", "obsidian_path", "created_at"]
        extra_kwargs = {"author": {"required": False}, "url": {"required": False}}

    def validate_parts(self, parts):
        unique_ids(parts, "Части")
        return parts

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["parts"] = [{"id": str(p.id), "title": p.title, "status": p.status} for p in instance.parts.all()]
        return data

    @transaction.atomic
    def create(self, validated_data):
        parts = validated_data.pop("parts", [])
        material = Material.objects.create(user=self.context["request"].user, **validated_data)
        sync_children(material, "material", MaterialPart, parts)
        return material

    @transaction.atomic
    def update(self, instance, validated_data):
        parts = validated_data.pop("parts", None)
        material = super().update(instance, validated_data)
        # Удалённые части снимаются с задач сами: у Task.part — SET_NULL.
        if parts is not None:
            sync_children(material, "material", MaterialPart, parts)
        return material


class NoteSerializer(serializers.ModelSerializer):
    material_id = optional_ref(Material, "material")
    questions = serializers.ListField(child=serializers.CharField(max_length=2000), required=False)

    class Meta:
        model = Note
        fields = ["id", "title", "material_id", "questions", "summary", "obsidian_uri", "status", "added_on", "obsidian_path", "created_at"]
        read_only_fields = ["id", "obsidian_path", "created_at"]
        extra_kwargs = {
            "summary": {"required": False},
            "obsidian_uri": {"required": False},
            "status": {"required": False},
            "added_on": {"required": False},
        }

    def validate_obsidian_uri(self, value: str) -> str:
        if value and not value.startswith("obsidian://"):
            raise serializers.ValidationError("Ссылка на Obsidian должна начинаться с obsidian://")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        # Первое повторение — на следующий день после добавления; по умолчанию добавлена сегодня.
        validated_data.setdefault("added_on", request_today(request))
        return Note.objects.create(user=request.user, **validated_data)


class ReviewSerializer(serializers.ModelSerializer):
    note_id = OwnedField(Note, source="note")

    class Meta:
        model = Review
        fields = ["id", "note_id", "date", "rating", "explain", "taught", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"explain": {"required": False}, "taught": {"required": False}}


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ["daily_review_limit", "active_materials_limit", "new_notes_per_day", "strict_mode"]
        extra_kwargs = {
            name: {"min_value": low, "max_value": high} for name, (low, high) in SETTINGS_RANGES.items()
        }


class VacationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vacation
        fields = ["id", "start", "end", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"end": {"required": True, "allow_null": True}}

    def validate(self, attrs):
        request = self.context["request"]
        start = attrs.get("start", getattr(self.instance, "start", None))
        end = attrs["end"] if "end" in attrs else getattr(self.instance, "end", None)
        others = Vacation.objects.filter(user=request.user)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        error = vacation_error(start, end, [(v.start, v.end) for v in others], request_today(request))
        if error:
            raise serializers.ValidationError(error, code="vacation")
        return attrs

    def create(self, validated_data):
        return Vacation.objects.create(user=self.context["request"].user, **validated_data)


def clean_checklist(value) -> list[dict]:
    """Подзадачи: [{id, text, done}] с непустыми id и текстом; лишние поля отбрасываются."""
    if not isinstance(value, list):
        raise serializers.ValidationError("Подзадачи должны быть списком.")
    items = []
    for i, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise serializers.ValidationError(f"Подзадача {i} должна быть объектом.")
        item_id, text, done = item.get("id"), item.get("text"), item.get("done")
        if not isinstance(item_id, str) or not item_id.strip() or not isinstance(text, str) or not text.strip():
            raise serializers.ValidationError(f"Подзадача {i}: нужны id и текст.")
        if not isinstance(done, bool):
            raise serializers.ValidationError(f"Подзадача {i}: поле done должно быть true или false.")
        items.append({"id": item_id, "text": text, "done": done})
    if len({item["id"] for item in items}) != len(items):
        raise serializers.ValidationError("Подзадачи: повторяется id.")
    return items


class TaskSerializer(serializers.ModelSerializer):
    area_id = optional_ref(Area, "area")
    project_id = optional_ref(Project, "project")
    milestone_id = optional_ref(Milestone, "milestone", owner="project__user")
    material_id = optional_ref(Material, "material")
    part_id = optional_ref(MaterialPart, "part", owner="material__user")
    checklist = serializers.JSONField(required=False)
    recurrence = serializers.JSONField(required=False, allow_null=True)
    repeat_of = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "notes",
            "status",
            "important",
            "deadline",
            "planned_date",
            "area_id",
            "project_id",
            "milestone_id",
            "material_id",
            "part_id",
            "checklist",
            "recurrence",
            "repeat_of",
            "completed_at",
            "created_at",
        ]
        read_only_fields = ["id", "repeat_of", "completed_at", "created_at"]
        extra_kwargs = {
            "notes": {"required": False},
            "important": {"required": False},
            "deadline": {"required": False},
            "planned_date": {"required": False},
        }

    def validate_checklist(self, value):
        return clean_checklist(value)

    def validate_recurrence(self, value):
        if value is None:
            return None
        try:
            return parse_rule(value).to_json()
        except RuleError as error:
            raise serializers.ValidationError(str(error)) from error

    def validate(self, attrs):
        """
        Как applyTaskPatch на фронтенде: задача, перенесённая в другой проект (материал) без новой вехи
        (части), теряет старую; веха — только из вех проекта задачи, часть — из частей её материала.
        """
        task = self.instance
        for parent, child in (("project", "milestone"), ("material", "part")):
            if task is not None and parent in attrs and attrs[parent] != getattr(task, parent) and child not in attrs:
                attrs[child] = None
            parent_value = attrs[parent] if parent in attrs else getattr(task, parent, None)
            child_value = attrs[child] if child in attrs else getattr(task, child, None)
            if parent_value is None:
                if child_value is not None:
                    attrs[child] = None
            elif child_value is not None and getattr(child_value, f"{parent}_id") != parent_value.id:
                label = "Веха не из проекта задачи." if child == "milestone" else "Часть не из материала задачи."
                raise serializers.ValidationError({f"{child}_id": label})
        return attrs

    def update(self, instance, validated_data):
        # Закрытие повторяющейся задачи порождает следующий повтор — см. services.update_task.
        return update_task(instance, validated_data, request_today(self.context["request"]), timezone.now())

    def create(self, validated_data):
        now = timezone.now()
        return Task.objects.create(
            user=self.context["request"].user,
            completed_at=now if task_closed(validated_data.get("status", "todo")) else None,
            created_at=now,
            **validated_data,
        )


class MilestoneSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    title = serializers.CharField(max_length=500)
    deadline = serializers.DateField(required=False, allow_null=True, default=None)


class ProjectSerializer(serializers.ModelSerializer):
    area_id = optional_ref(Area, "area")
    goal_id = optional_ref(Goal, "goal")
    milestones = MilestoneSerializer(many=True, required=False)

    class Meta:
        model = Project
        fields = ["id", "title", "description", "area_id", "goal_id", "status", "deadline", "milestones", "completed_at", "created_at"]
        read_only_fields = ["id", "completed_at", "created_at"]
        extra_kwargs = {"description": {"required": False}, "deadline": {"required": False}, "status": {"required": False}}

    def validate_milestones(self, milestones):
        unique_ids(milestones, "Вехи")
        return milestones

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["milestones"] = [
            {"id": str(m.id), "title": m.title, "deadline": m.deadline.isoformat() if m.deadline else None} for m in instance.milestones.all()
        ]
        return data

    @transaction.atomic
    def create(self, validated_data):
        milestones = validated_data.pop("milestones", [])
        closed = validated_data.get("status", "active") in CLOSED_PROJECT
        project = Project.objects.create(
            user=self.context["request"].user, completed_at=timezone.now() if closed else None, **validated_data
        )
        sync_children(project, "project", Milestone, milestones)
        return project

    @transaction.atomic
    def update(self, instance, validated_data):
        milestones = validated_data.pop("milestones", None)
        if "status" in validated_data:
            was_closed, closed = instance.status in CLOSED_PROJECT, validated_data["status"] in CLOSED_PROJECT
            if was_closed != closed:
                instance.completed_at = timezone.now() if closed else None
        project = super().update(instance, validated_data)
        # Задачи удалённых вех остаются в проекте без вехи: у Task.milestone — SET_NULL.
        if milestones is not None:
            sync_children(project, "project", Milestone, milestones)
        return project

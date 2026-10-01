"""
Модель данных повторяет типы фронтенда (frontend/src/domain/types.ts, схема v9).
Всё, что можно вычислить (прогресс целей, расписание заметок, «законспектирована» у части),
не хранится. id — UUID: их нельзя перебрать, и они совпадают по формату с фронтендом.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

User = settings.AUTH_USER_MODEL


class AreaColor(models.TextChoices):
    CLAY = "clay"
    OCHRE = "ochre"
    SAGE = "sage"
    TEAL = "teal"
    SLATE = "slate"
    PLUM = "plum"
    ROSE = "rose"
    STONE = "stone"


class AreaIcon(models.TextChoices):
    BOOK = "book"
    LANGUAGES = "languages"
    DUMBBELL = "dumbbell"
    STUDY = "study"
    WORK = "work"
    HEALTH = "health"
    CODE = "code"
    MUSIC = "music"
    MONEY = "money"
    HOME = "home"
    TRAVEL = "travel"
    STAR = "star"


class Priority(models.TextChoices):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GoalStatus(models.TextChoices):
    ACTIVE = "active"
    ARCHIVED = "archived"


class GoalKind(models.TextChoices):
    TARGET = "target"
    HABIT = "habit"


class MaterialType(models.TextChoices):
    BOOK = "book"
    COURSE = "course"
    LECTURE = "lecture"
    ARTICLE = "article"
    VIDEO = "video"
    OTHER = "other"


class MaterialStatus(models.TextChoices):
    QUEUED = "queued"
    ACTIVE = "active"
    DONE = "done"
    DROPPED = "dropped"


class PartStatus(models.TextChoices):
    TODO = "todo"
    STUDIED = "studied"
    SUMMARIZED = "summarized"


class NoteStatus(models.TextChoices):
    ACTIVE = "active"
    PAUSED = "paused"


class Rating(models.TextChoices):
    AGAIN = "again"
    HARD = "hard"
    GOOD = "good"
    EASY = "easy"


class Explain(models.TextChoices):
    NO = "no"
    HINTS = "hints"
    YES = "yes"


class TaskStatus(models.TextChoices):
    INBOX = "inbox"
    TODO = "todo"
    DONE = "done"
    CANCELLED = "cancelled"


class ProjectStatus(models.TextChoices):
    ACTIVE = "active"
    PAUSED = "paused"
    DONE = "done"
    DROPPED = "dropped"


def new_id() -> uuid.UUID:
    return uuid.uuid4()


class Area(models.Model):
    """Сфера жизни: «Чтение», «Языки», «Спорт»."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="areas")
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=10, choices=AreaColor.choices)
    icon = models.CharField(max_length=20, choices=AreaIcon.choices)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["order", "created_at", "id"]

    def __str__(self) -> str:
        return self.name


class Goal(models.Model):
    """
    Цель к сроку («прочитать 480 страниц к 19 октября») или привычка («английский 20 минут каждый день»,
    «зал 3 раза в неделю»). У привычки нет срока, а target_value — норма за день.
    """

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="goals")
    kind = models.CharField(max_length=10, choices=GoalKind.choices, default=GoalKind.TARGET)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="goals")
    unit = models.CharField(max_length=50)
    # Цель — сколько всего к сроку; привычка — сколько за день.
    target_value = models.FloatField()
    start_date = models.DateField()
    # Только у цели к сроку.
    deadline = models.DateField(null=True, blank=True)
    # Только у привычки: 7 — каждый день, 3 — «3 раза в неделю» в любые дни.
    days_per_week = models.PositiveSmallIntegerField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=10, choices=GoalStatus.choices, default=GoalStatus.ACTIVE)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(deadline__isnull=True) | Q(deadline__gte=F("start_date")), name="goal_deadline_after_start"
            ),
            models.CheckConstraint(condition=Q(target_value__gt=0), name="goal_target_positive"),
            models.CheckConstraint(
                condition=(Q(kind=GoalKind.TARGET) & Q(deadline__isnull=False) & Q(days_per_week__isnull=True))
                | (Q(kind=GoalKind.HABIT) & Q(deadline__isnull=True) & Q(days_per_week__gte=1) & Q(days_per_week__lte=7)),
                name="goal_kind_fields",
            ),
        ]

    def __str__(self) -> str:
        return self.title


class ProgressEntry(models.Model):
    """Запись прогресса: «12 октября прочитал 25 страниц». В день записей может быть несколько."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    goal = models.ForeignKey(Goal, on_delete=models.CASCADE, related_name="entries")
    date = models.DateField()
    value = models.FloatField()
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["date", "created_at", "id"]
        indexes = [models.Index(fields=["goal", "date"])]
        constraints = [models.CheckConstraint(condition=Q(value__gt=0), name="entry_value_positive")]


class Material(models.Model):
    """Источник знаний: книга, курс, лекция."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField(max_length=500)
    type = models.CharField(max_length=10, choices=MaterialType.choices)
    author = models.CharField(max_length=300, blank=True)
    url = models.CharField(max_length=2000, blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials")
    status = models.CharField(max_length=10, choices=MaterialStatus.choices, default=MaterialStatus.ACTIVE)
    # Путь к странице материала в хранилище Obsidian; null — материал создан в трекере.
    obsidian_path = models.CharField(max_length=1000, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return self.title


class MaterialPart(models.Model):
    """
    Часть материала: глава, лекция. На фронтенде — список внутри материала, в API вложена в материал.
    «Законспектирована» по сделанной задаче-конспекту не хранится, а вычисляется.
    """

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name="parts")
    title = models.CharField(max_length=500)
    status = models.CharField(max_length=12, choices=PartStatus.choices, default=PartStatus.TODO)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class Note(models.Model):
    """Заметка для повторения. Уровень освоения и расписание вычисляются из журнала повторений."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=500)
    material = models.ForeignKey(Material, null=True, blank=True, on_delete=models.SET_NULL, related_name="notes")
    questions = models.JSONField(default=list)
    summary = models.TextField(blank=True)
    obsidian_uri = models.CharField(max_length=2000, blank=True)
    status = models.CharField(max_length=10, choices=NoteStatus.choices, default=NoteStatus.ACTIVE)
    added_on = models.DateField()
    obsidian_path = models.CharField(max_length=1000, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return self.title


class Review(models.Model):
    """Одно повторение заметки. Журнал хранится целиком: по нему пересчитывается расписание."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name="reviews")
    date = models.DateField()
    rating = models.CharField(max_length=5, choices=Rating.choices)
    explain = models.CharField(max_length=5, choices=Explain.choices, null=True, blank=True)
    taught = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["date", "created_at", "id"]
        indexes = [models.Index(fields=["note", "date"])]


class UserSettings(models.Model):
    """Мягкие лимиты нагрузки и часовой пояс (нужен серверу, чтобы знать «сегодня» пользователя)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="tracker_settings")
    daily_review_limit = models.PositiveSmallIntegerField(default=15)
    active_materials_limit = models.PositiveSmallIntegerField(default=3)
    new_notes_per_day = models.PositiveSmallIntegerField(default=5)
    strict_mode = models.BooleanField(default=False)
    timezone = models.CharField(max_length=64, default="UTC")


class Vacation(models.Model):
    """Отпуск: повторения на паузе. Пересечения проверяются так же, как на фронтенде (rules/vacations.py)."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="vacations")
    start = models.DateField()
    # Последний день включительно; null — «пока не выключу».
    end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["start"]
        constraints = [
            models.CheckConstraint(condition=Q(end__isnull=True) | Q(end__gte=F("start")), name="vacation_end_after_start"),
        ]


class Project(models.Model):
    """Проект — набор задач с вехами: «Подготовиться к IELTS». Можно связать с целью."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="projects")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="projects")
    goal = models.ForeignKey(Goal, null=True, blank=True, on_delete=models.SET_NULL, related_name="projects")
    status = models.CharField(max_length=10, choices=ProjectStatus.choices, default=ProjectStatus.ACTIVE)
    deadline = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return self.title


class Milestone(models.Model):
    """Веха проекта. На фронтенде — список внутри проекта, в API вложена в проект."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    title = models.CharField(max_length=500)
    deadline = models.DateField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class Task(models.Model):
    """Задача. «Входящие» — задачи со статусом inbox."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=500)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=TaskStatus.choices, default=TaskStatus.TODO)
    important = models.BooleanField(default=False)
    deadline = models.DateField(null=True, blank=True)
    planned_date = models.DateField(null=True, blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    milestone = models.ForeignKey(Milestone, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    material = models.ForeignKey(Material, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    part = models.ForeignKey(MaterialPart, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    # Подзадачи [{id, text, done}] — без своей истории, поэтому списком внутри задачи.
    checklist = models.JSONField(default=list)
    # Повтор {unit, interval, weekdays, start} или null — разовая задача (см. rules/recurrence.py).
    recurrence = models.JSONField(null=True, blank=True)
    repeat_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="repeats")
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["user", "status", "planned_date"])]

    def __str__(self) -> str:
        return self.title


class WeeklyReview(models.Model):
    """
    Обзор недели: итоги недели и фокус на следующую. week_start — понедельник недели, которую подводили;
    фокус — до трёх пунктов [{id, text, done}], как подзадачи у задачи.
    """

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="weekly_reviews")
    week_start = models.DateField()
    focus = models.JSONField(default=list)
    reflection = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["week_start"]
        constraints = [models.UniqueConstraint(fields=["user", "week_start"], name="weekly_review_one_per_week")]

    def __str__(self) -> str:
        return f"Обзор недели {self.week_start}"


class SiteSettings(models.Model):
    """Настройки сервера, общие для всех аккаунтов: одна строка, pk=1. Меняет администратор в «Настройках»."""

    # Открыта ли регистрация на экране входа; null — как задано в ALLOW_REGISTRATION.
    registration_open = models.BooleanField(null=True, blank=True)

    class Meta:
        verbose_name = "настройки сервера"
        verbose_name_plural = "настройки сервера"

    @classmethod
    def load(cls, *, lock: bool = False) -> "SiteSettings":
        """`lock` — до конца транзакции: две регистрации подряд не решат одновременно, что они первые."""
        objects = cls.objects.select_for_update() if lock else cls.objects
        return objects.get_or_create(pk=1)[0]

    @property
    def registration(self) -> bool:
        return settings.ALLOW_REGISTRATION if self.registration_open is None else self.registration_open

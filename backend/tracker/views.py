"""
API трекера. Каждый пользователь видит и меняет только свои данные: чужой объект — как
несуществующий (404). Списки отдаются целиком — фронтенд считает всё сам, как и раньше.
"""

import uuid

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import backup
from .defaults import user_settings
from .models import Area, Goal, Material, Note, ProgressEntry, Project, Review, Task, Vacation
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

# Полная замена объекта (PUT) не нужна: фронтенд присылает только изменённые поля.
WITHOUT_PUT = ["get", "post", "patch", "delete", "head", "options"]


class OwnedViewSet(viewsets.ModelViewSet):
    http_method_names = WITHOUT_PUT
    model = None
    owner = "user"

    def get_queryset(self):
        # Генератор схемы API строит запросы без пользователя.
        if getattr(self, "swagger_fake_view", False):
            return self.model.objects.none()
        return self.model.objects.filter(**{self.owner: self.request.user})


class AreaViewSet(OwnedViewSet):
    """Сферы. При удалении цели, материалы, задачи и проекты остаются без сферы."""

    model = Area
    serializer_class = AreaSerializer


class GoalViewSet(OwnedViewSet):
    """Цели. Удаляются с записями прогресса; проекты удалённой цели остаются без цели."""

    model = Goal
    serializer_class = GoalSerializer


@extend_schema(parameters=[OpenApiParameter("goal", OpenApiTypes.UUID, description="Только записи этой цели")])
class EntryViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Записи прогресса; `?goal=<id>` — записи одной цели."""

    serializer_class = EntrySerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ProgressEntry.objects.none()
        entries = ProgressEntry.objects.filter(goal__user=self.request.user)
        goal = self.request.query_params.get("goal")
        if goal is not None:
            try:
                entries = entries.filter(goal_id=uuid.UUID(goal))
            except ValueError:
                raise ValidationError({"goal": "Некорректный id цели."}) from None
        return entries


class MaterialViewSet(OwnedViewSet):
    """Материалы с вложенными частями. Заметки и задачи удалённого материала остаются без него."""

    model = Material
    serializer_class = MaterialSerializer

    def get_queryset(self):
        return super().get_queryset().prefetch_related("parts")


class NoteViewSet(OwnedViewSet):
    """Заметки; удаляются вместе с журналом повторений."""

    model = Note
    serializer_class = NoteSerializer


class ReviewViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Журнал повторений. Удаление записи — отмена оценки."""

    serializer_class = ReviewSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Review.objects.none()
        return Review.objects.filter(note__user=self.request.user)


class VacationViewSet(OwnedViewSet):
    """Отпуска; пересечения и неверные даты — 400 с объяснением."""

    model = Vacation
    serializer_class = VacationSerializer


class TaskViewSet(OwnedViewSet):
    """Задачи вместе со «Входящими». Закрытие повторяющейся задачи создаёт следующий повтор."""

    model = Task
    serializer_class = TaskSerializer

    def get_queryset(self):
        tasks = super().get_queryset()
        # Правка задачи и её повторов — под блокировкой: две отметки подряд не создадут два повтора.
        return tasks.select_for_update() if self.request.method == "PATCH" else tasks


class ProjectViewSet(OwnedViewSet):
    """Проекты с вложенными вехами. Задачи удалённой вехи или проекта остаются без них."""

    model = Project
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return super().get_queryset().prefetch_related("milestones")


class SettingsView(APIView):
    """Лимиты нагрузки — одни на пользователя."""

    @extend_schema(responses=SettingsSerializer)
    def get(self, request):
        return Response(SettingsSerializer(user_settings(request.user)).data)

    @extend_schema(request=SettingsSerializer, responses=SettingsSerializer)
    def patch(self, request):
        serializer = SettingsSerializer(user_settings(request.user), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def _data_error(error: backup.DataError) -> ValidationError:
    return ValidationError({"detail": str(error)})


class ExportView(APIView):
    """Резервная копия в том же формате, что и у фронтенда без сервера."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(backup.export_data(request))


class ImportView(APIView):
    """Полная замена данных копией текущей версии схемы (старые версии фронтенд переводит сам)."""

    @extend_schema(request=OpenApiTypes.OBJECT, responses={204: None})
    def post(self, request):
        try:
            backup.import_data(request.user, request.data)
        except backup.DataError as error:
            raise _data_error(error) from error
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResetView(APIView):
    """Удалить всё и начать заново со сферами по умолчанию."""

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        backup.reset_data(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ObsidianApplyView(APIView):
    """Новые и изменённые материалы и заметки из хранилища Obsidian (отчёт считает фронтенд)."""

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses=inline_serializer("ObsidianApplied", {"materials": serializers.IntegerField(), "notes": serializers.IntegerField()}),
    )
    def post(self, request):
        try:
            counts = backup.apply_obsidian(request.user, request.data)
        except backup.DataError as error:
            raise _data_error(error) from error
        return Response(counts)

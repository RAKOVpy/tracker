"""
Управление сервером для администратора — раздел «Сервер» в настройках трекера: открыть или закрыть
регистрацию, посмотреть аккаунты, выдать временный пароль вместо забытого, удалить аккаунт.
Писем сервер не отправляет: временный пароль администратор передаёт сам.
"""

import secrets

from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SiteSettings

User = get_user_model()

SiteSchema = inline_serializer("Site", {"registration": serializers.BooleanField()})
AccountListSchema = inline_serializer(
    "Account",
    {
        "id": serializers.IntegerField(),
        "email": serializers.EmailField(),
        "is_admin": serializers.BooleanField(),
        "date_joined": serializers.DateTimeField(),
        "last_login": serializers.DateTimeField(allow_null=True),
    },
    many=True,
)
TemporaryPasswordSchema = inline_serializer("TemporaryPassword", {"password": serializers.CharField()})

# Без похожих символов (l и 1, o и 0): пароль диктуют или переписывают с экрана.
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def temporary_password() -> str:
    """Вида k7mq-x3vp-9wtr: 12 случайных символов, около 59 бит."""
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3))


def account_data(user) -> dict:
    return {
        "id": user.pk,
        "email": user.email,
        "is_admin": user.is_staff,
        "date_joined": user.date_joined,
        "last_login": user.last_login,
    }


class SiteView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=SiteSchema)
    def get(self, request):
        return Response({"registration": SiteSettings.load().registration})

    @extend_schema(request=SiteSchema, responses=SiteSchema)
    def patch(self, request):
        registration = request.data.get("registration")
        if not isinstance(registration, bool):
            raise ValidationError({"detail": "registration — true или false."})
        site = SiteSettings.load(lock=True)
        site.registration_open = registration
        site.save(update_fields=["registration_open"])
        return Response({"registration": site.registration})


def _other_account(request, pk: int, own_message: str):
    """Чужой аккаунт по id. Свой нельзя: себя не удалить и пароль себе не сбросить в обход текущего."""
    if pk == request.user.pk:
        raise ValidationError({"detail": own_message})
    try:
        return User.objects.get(pk=pk)
    except User.DoesNotExist:
        raise NotFound("Аккаунт не найден — возможно, его уже удалили.") from None


class AccountListView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=AccountListSchema)
    def get(self, request):
        return Response([account_data(user) for user in User.objects.order_by("date_joined", "pk")])


class AccountView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses={204: None})
    def delete(self, request, pk: int):
        user = _other_account(request, pk, "Свой аккаунт отсюда удалить нельзя.")
        # Данные аккаунта удаляются вместе с ним (on_delete=CASCADE), входы на устройствах — тоже недействительны.
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountPasswordView(APIView):
    """Временный пароль вместо забытого. Прежний перестаёт работать, входы на всех устройствах завершаются."""

    permission_classes = [IsAdminUser]

    @extend_schema(request=None, responses=TemporaryPasswordSchema)
    def post(self, request, pk: int):
        user = _other_account(request, pk, "Свой пароль меняйте в разделе «Аккаунт».")
        password = temporary_password()
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"password": password})

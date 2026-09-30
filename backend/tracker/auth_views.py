"""
Вход по почте и паролю. Сессия — в httpOnly-куке, запросы с изменениями защищены CSRF-токеном
(кука csrftoken → заголовок X-CSRFToken). Фронтенд сначала запрашивает /api/auth/session/.
"""

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .auth import SessionAuthentication
from .defaults import user_settings
from .rules.dates import zone

User = get_user_model()

UserSchema = inline_serializer("User", {"id": serializers.IntegerField(), "email": serializers.EmailField()})
SessionSchema = inline_serializer("Session", {"user": UserSchema, "registration": serializers.BooleanField()})
LoggedInSchema = inline_serializer("LoggedIn", {"user": UserSchema})
CredentialsSchema = inline_serializer("Credentials", {"email": serializers.EmailField(), "password": serializers.CharField()})


def user_data(user) -> dict | None:
    return {"id": user.pk, "email": user.email} if user.is_authenticated else None


def _enforce_csrf(request) -> None:
    """DRF проверяет CSRF только у вошедших; вход и регистрацию тоже защищаем — от подмены аккаунта."""
    SessionAuthentication().enforce_csrf(request)


def _credentials(request) -> tuple[str, str]:
    email = request.data.get("email")
    password = request.data.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
        raise ValidationError({"detail": "Введите почту и пароль."})
    return email.strip().lower(), password


@method_decorator(ensure_csrf_cookie, name="get")
class SessionView(APIView):
    """Кто вошёл (или null) и открыта ли регистрация. Заодно ставит куку CSRF и запоминает часовой пояс."""

    permission_classes = [AllowAny]

    @extend_schema(responses=SessionSchema)
    def get(self, request):
        if request.user.is_authenticated:
            tz = request.headers.get("X-Timezone")
            settings_obj = user_settings(request.user)
            if zone(tz) is not None and settings_obj.timezone != tz:
                settings_obj.timezone = tz
                settings_obj.save(update_fields=["timezone"])
        return Response({"user": user_data(request.user), "registration": settings.ALLOW_REGISTRATION})


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=CredentialsSchema, responses=LoggedInSchema)
    def post(self, request):
        _enforce_csrf(request)
        email, password = _credentials(request)
        user = authenticate(request, username=email, password=password)
        if user is None:
            raise ValidationError({"detail": "Неверная почта или пароль."})
        login(request, user)
        return Response({"user": user_data(user)})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=CredentialsSchema, responses={201: LoggedInSchema})
    def post(self, request):
        _enforce_csrf(request)
        if not settings.ALLOW_REGISTRATION:
            raise PermissionDenied("Регистрация на этом сервере закрыта.")
        email, password = _credentials(request)
        try:
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError({"detail": "Похоже, в адресе почты опечатка."}) from None
        if User.objects.filter(username=email).exists():
            raise ValidationError({"detail": "Такая почта уже зарегистрирована. Войдите."})
        candidate = User(username=email, email=email)
        try:
            validate_password(password, candidate)
        except DjangoValidationError as error:
            raise ValidationError({"detail": " ".join(error.messages)}) from None
        # Сферы по умолчанию и настройки создаёт сигнал (signals.py).
        user = User.objects.create_user(username=email, email=email, password=password)
        login(request, user)
        return Response({"user": user_data(user)}, status=status.HTTP_201_CREATED)

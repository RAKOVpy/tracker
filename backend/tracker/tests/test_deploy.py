"""Что нужно на сервере: проверка здоровья для Docker и аккаунт из командной строки при закрытой регистрации."""

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from tracker.models import Area

from .conftest import make_user

pytestmark = pytest.mark.django_db

PASSWORD = "correct horse battery"


class Input(StringIO):
    """stdin: из файла или конвейера (isatty — нет) либо терминал."""

    def __init__(self, text: str = "", tty: bool = False):
        super().__init__(text)
        self.tty = tty

    def isatty(self) -> bool:
        return self.tty


def adduser(*args, stdin: Input) -> str:
    out = StringIO()
    call_command("adduser", *args, stdin=stdin, stdout=out, stderr=out)
    return out.getvalue()


def test_health_without_login():
    response = APIClient().get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_adduser_from_stdin_logs_in_like_registered(settings):
    settings.ALLOW_REGISTRATION = False
    output = adduser(" Me@Example.com ", stdin=Input(PASSWORD + "\n"))
    assert "me@example.com создан" in output
    user = get_user_model().objects.get(username="me@example.com")
    assert user.email == "me@example.com" and not user.is_staff
    assert [a.name for a in Area.objects.filter(user=user)] == ["Чтение", "Языки", "Спорт", "Учёба"]

    client = APIClient()
    token = client.get("/api/auth/session/").cookies["csrftoken"].value
    response = client.post("/api/auth/login/", {"email": "me@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200


def test_adduser_admin():
    adduser("boss@example.com", "--admin", stdin=Input(PASSWORD))
    user = get_user_model().objects.get(username="boss@example.com")
    assert user.is_staff and user.is_superuser


@pytest.mark.parametrize(
    ("email", "password", "message"),
    [
        ("not-an-email", PASSWORD, "опечатка"),
        ("me@example.com", "", "Пароль не задан"),
        ("me@example.com", "12345678", "слишком широко распространён"),
    ],
)
def test_adduser_rejects_bad_input(email, password, message):
    with pytest.raises(CommandError, match=message):
        adduser(email, stdin=Input(password + "\n"))
    assert not get_user_model().objects.exists()


def test_adduser_existing_account_untouched():
    user = make_user("me@example.com")
    with pytest.raises(CommandError, match="changepassword me@example.com"):
        adduser("ME@example.com", stdin=Input("another long password\n"))
    user.refresh_from_db()
    assert user.check_password("correct horse battery")


def test_adduser_asks_again_in_terminal(monkeypatch):
    # Не совпали, слишком короткий, наконец подходит.
    answers = iter(["first long password", "second long password", "short", "short", PASSWORD, PASSWORD])
    monkeypatch.setattr("getpass.getpass", lambda prompt: next(answers))
    output = adduser("me@example.com", stdin=Input(tty=True))
    assert "не совпали" in output
    assert "слишком короткий" in output
    assert get_user_model().objects.get(username="me@example.com").check_password(PASSWORD)


def test_adduser_cancelled(monkeypatch):
    def interrupt(prompt):
        raise KeyboardInterrupt

    monkeypatch.setattr("getpass.getpass", interrupt)
    with pytest.raises(CommandError, match="Отменено"):
        adduser("me@example.com", stdin=Input(tty=True))
    assert not get_user_model().objects.exists()

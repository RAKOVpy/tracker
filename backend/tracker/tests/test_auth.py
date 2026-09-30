import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from tracker.models import Area, UserSettings

pytestmark = pytest.mark.django_db

PASSWORD = "correct horse battery"


def csrf_client() -> tuple[APIClient, str]:
    """Клиент как браузер: CSRF проверяется, токен берётся из куки после /auth/session/."""
    client = APIClient(enforce_csrf_checks=True)
    response = client.get("/api/auth/session/")
    return client, response.cookies["csrftoken"].value


def test_session_anonymous():
    response = APIClient().get("/api/auth/session/")
    assert response.status_code == 200
    assert response.json() == {"user": None, "registration": True}
    assert "csrftoken" in response.cookies


def test_data_requires_login():
    response = APIClient().get("/api/tasks/")
    assert response.status_code == 401
    assert response.json()["detail"]


def test_register_creates_defaults_and_logs_in():
    client, token = csrf_client()
    response = client.post("/api/auth/register/", {"email": " Me@Example.com ", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 201
    assert response.json()["user"]["email"] == "me@example.com"
    user_id = response.json()["user"]["id"]
    assert [a.name for a in Area.objects.filter(user_id=user_id)] == ["Чтение", "Языки", "Спорт", "Учёба"]
    assert UserSettings.objects.get(user_id=user_id).daily_review_limit == 15
    # Сессия уже открыта.
    assert client.get("/api/areas/").status_code == 200


def test_register_rejects_bad_input():
    client, token = csrf_client()
    post = lambda body: client.post("/api/auth/register/", body, format="json", HTTP_X_CSRFTOKEN=token)  # noqa: E731
    assert "опечатка" in post({"email": "not-an-email", "password": PASSWORD}).json()["detail"]
    assert post({"email": "a@example.com", "password": "123"}).status_code == 400
    assert post({"email": "a@example.com"}).json()["detail"] == "Введите почту и пароль."
    assert post({"email": "a@example.com", "password": PASSWORD}).status_code == 201
    client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    client, token = csrf_client()
    duplicate = client.post("/api/auth/register/", {"email": "A@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert "уже зарегистрирована" in duplicate.json()["detail"]


@override_settings(ALLOW_REGISTRATION=False)
def test_registration_can_be_closed():
    client, token = csrf_client()
    assert client.get("/api/auth/session/").json()["registration"] is False
    response = client.post("/api/auth/register/", {"email": "a@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 403


def test_login_logout(user):
    client, token = csrf_client()
    wrong = client.post("/api/auth/login/", {"email": "me@example.com", "password": "nope"}, format="json", HTTP_X_CSRFTOKEN=token)
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Неверная почта или пароль."

    response = client.post("/api/auth/login/", {"email": "ME@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200
    assert client.get("/api/auth/session/").json()["user"]["email"] == "me@example.com"

    # После входа CSRF-токен меняется — берём новый из куки.
    token = client.cookies["csrftoken"].value
    assert client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=token).status_code == 204
    assert client.get("/api/tasks/").status_code == 401


def test_csrf_is_required(user):
    client, token = csrf_client()
    assert client.post("/api/auth/login/", {"email": "me@example.com", "password": PASSWORD}, format="json").status_code == 403
    client.post("/api/auth/login/", {"email": "me@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    # Вошедший без токена ничего не меняет.
    response = client.post("/api/tasks/", {"title": "x", "status": "todo"}, format="json")
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


def test_login_is_throttled(user):
    client, token = csrf_client()
    codes = [
        client.post("/api/auth/login/", {"email": "me@example.com", "password": "nope"}, format="json", HTTP_X_CSRFTOKEN=token).status_code
        for _ in range(21)
    ]
    assert codes[-1] == 429


def test_session_remembers_timezone(api, user):
    api.get("/api/auth/session/", HTTP_X_TIMEZONE="Europe/Moscow")
    assert UserSettings.objects.get(user=user).timezone == "Europe/Moscow"
    api.get("/api/auth/session/", HTTP_X_TIMEZONE="Not/AZone")
    assert UserSettings.objects.get(user=user).timezone == "Europe/Moscow"

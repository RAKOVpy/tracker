"""Регистрация на сайте и раздел «Сервер» для администратора: первый аккаунт, переключатель, аккаунты."""

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APIClient

from tracker.models import Goal, SiteSettings
from tracker.server_views import ALPHABET

from .conftest import make_user
from .test_auth import PASSWORD, csrf_client, login

pytestmark = pytest.mark.django_db

User = get_user_model()


def register(email: str) -> tuple[APIClient, dict]:
    client, token = csrf_client()
    response = client.post("/api/auth/register/", {"email": email, "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 201, response.json()
    return client, response.json()["user"]


def csrf(client: APIClient) -> dict:
    return {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


def test_first_account_becomes_admin_next_ones_do_not():
    assert APIClient().get("/api/auth/session/").json()["firstAccount"] is True
    owner, owner_data = register("owner@example.com")
    assert owner_data["isAdmin"] is True
    assert User.objects.get(email="owner@example.com").is_superuser
    assert APIClient().get("/api/auth/session/").json()["firstAccount"] is False

    _, friend_data = register("friend@example.com")
    assert friend_data["isAdmin"] is False
    assert owner.get("/api/auth/session/").json()["user"] == {**owner_data, "isAdmin": True}


def test_admin_toggles_registration():
    owner, _ = register("owner@example.com")
    assert owner.get("/api/site/").json() == {"registration": True}

    response = owner.patch("/api/site/", {"registration": False}, format="json", **csrf(owner))
    assert response.json() == {"registration": False}
    client, token = csrf_client()
    assert client.get("/api/auth/session/").json()["registration"] is False
    closed = client.post("/api/auth/register/", {"email": "a@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert closed.status_code == 403
    assert closed.json()["detail"] == "Регистрация на этом сервере закрыта."

    assert owner.patch("/api/site/", {"registration": "yes"}, format="json", **csrf(owner)).status_code == 400
    owner.patch("/api/site/", {"registration": True}, format="json", **csrf(owner))
    register("a@example.com")


@override_settings(ALLOW_REGISTRATION=False)
def test_env_is_the_default_until_admin_switches():
    assert SiteSettings.load().registration is False
    SiteSettings.objects.filter(pk=1).update(registration_open=True)
    assert APIClient().get("/api/auth/session/").json()["registration"] is True


def test_server_section_is_for_admins_only(user):
    member = login()
    for path in ["/api/site/", "/api/accounts/"]:
        assert APIClient().get(path).status_code == 401
        assert member.get(path).status_code == 403
    assert member.patch("/api/site/", {"registration": False}, format="json", **csrf(member)).status_code == 403
    assert member.post(f"/api/accounts/{user.pk}/password/", **csrf(member)).status_code == 403
    assert member.delete(f"/api/accounts/{user.pk}/", **csrf(member)).status_code == 403


def test_accounts_list():
    owner, owner_data = register("owner@example.com")
    register("friend@example.com")
    accounts = owner.get("/api/accounts/").json()
    assert [(a["email"], a["isAdmin"]) for a in accounts] == [("owner@example.com", True), ("friend@example.com", False)]
    assert accounts[0]["id"] == owner_data["id"]
    assert accounts[0]["dateJoined"] and accounts[0]["lastLogin"]
    assert set(accounts[0]) == {"id", "email", "isAdmin", "dateJoined", "lastLogin"}


def test_temporary_password_replaces_forgotten_one():
    owner, owner_data = register("owner@example.com")
    phone, friend = register("friend@example.com")

    response = owner.post(f"/api/accounts/{friend['id']}/password/", **csrf(owner))
    password = response.json()["password"]
    assert len(password) == 14 and password.count("-") == 2
    assert set(password.replace("-", "")) <= set(ALPHABET)

    # Прежний пароль не подходит, вход на телефоне завершён, временный подходит.
    assert phone.get("/api/tasks/").status_code == 401
    client, token = csrf_client()
    old = client.post("/api/auth/login/", {"email": "friend@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert old.status_code == 400
    login("friend@example.com", password)

    own = owner.post(f"/api/accounts/{owner_data['id']}/password/", **csrf(owner))
    assert own.status_code == 400 and "«Аккаунт»" in own.json()["detail"]
    assert owner.post("/api/accounts/999999/password/", **csrf(owner)).status_code == 404


def test_delete_account_with_its_data():
    owner, owner_data = register("owner@example.com")
    spam, spam_data = register("spam@example.com")
    spam.post("/api/goals/", {"title": "x", "kind": "habit", "targetValue": 1, "unit": "раз", "daysPerWeek": 7}, format="json", **csrf(spam))

    assert owner.delete(f"/api/accounts/{spam_data['id']}/", **csrf(owner)).status_code == 204
    assert not User.objects.filter(email="spam@example.com").exists()
    assert not Goal.objects.filter(user_id=spam_data["id"]).exists()
    assert spam.get("/api/tasks/").status_code == 401

    own = owner.delete(f"/api/accounts/{owner_data['id']}/", **csrf(owner))
    assert own.status_code == 400
    assert User.objects.filter(email="owner@example.com").exists()
    assert owner.delete(f"/api/accounts/{spam_data['id']}/", **csrf(owner)).status_code == 404


def test_registration_is_throttled():
    client, token = csrf_client()
    codes = [
        client.post("/api/auth/register/", {"email": "bad", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [400] * 10
    assert codes[-1] == 429


def test_adduser_admin_promotes_existing_account():
    make_user("me@example.com")
    out = StringIO()
    call_command("adduser", "me@example.com", "--admin", stdout=out)
    assert "теперь администратор" in out.getvalue()
    user = User.objects.get(email="me@example.com")
    assert user.is_staff and user.is_superuser
    assert user.check_password("correct horse battery")

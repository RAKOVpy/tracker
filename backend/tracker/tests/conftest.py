import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _clean_cache():
    # Ограничение частоты входа хранится в кэше — между тестами он чистый.
    cache.clear()


@pytest.fixture(autouse=True)
def _fast_passwords(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


def make_user(email: str = "me@example.com"):
    return get_user_model().objects.create_user(username=email, email=email, password="correct horse battery")


@pytest.fixture
def user(db):
    return make_user()


@pytest.fixture
def api(user) -> APIClient:
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def other(db) -> APIClient:
    client = APIClient()
    client.force_login(make_user("other@example.com"))
    return client

"""Демо-аккаунт: трекер с историей за четыре месяца и хранилище Obsidian к нему (manage.py demo)."""

from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction

from ..backup import import_data
from .build import build_demo

DEMO_EMAIL = "demo@tracker.local"
DEMO_PASSWORD = "demo1234"
# Метка в имени пользователя: пересоздавать можно только аккаунт, созданный этой командой.
DEMO_MARK = "Демо"


class DemoError(Exception):
    """Демо нельзя создать: например, почта занята обычным аккаунтом."""


@transaction.atomic
def create_demo(today: date, email: str = DEMO_EMAIL, password: str = DEMO_PASSWORD, vault_name: str | None = None):
    """Создаёт демо-аккаунт или заново заполняет существующий: всё, что в нём меняли, пропадёт."""
    User = get_user_model()
    email = email.strip().lower()
    user = User.objects.filter(username=email).first()
    if user is None:
        user = User.objects.create_user(username=email, email=email, password=password, first_name=DEMO_MARK)
    elif user.first_name != DEMO_MARK:
        raise DemoError(f"Аккаунт {email} создан не этой командой — его данные не трогаю. Укажите другую почту: --email.")
    else:
        user.set_password(password)
        user.save(update_fields=["password"])
    import_data(user, build_demo(today, vault_name))
    return user

"""Что получает новый пользователь: четыре сферы и настройки нагрузки — как createEmptyDb на фронтенде."""

from django.db import transaction

from .models import Area, UserSettings

DEFAULT_AREAS = [
    {"name": "Чтение", "color": "ochre", "icon": "book"},
    {"name": "Языки", "color": "slate", "icon": "languages"},
    {"name": "Спорт", "color": "sage", "icon": "dumbbell"},
    {"name": "Учёба", "color": "clay", "icon": "study"},
]

DEFAULT_SETTINGS = {
    "daily_review_limit": 15,
    "active_materials_limit": 3,
    "new_notes_per_day": 5,
    "strict_mode": False,
}

# Сколько пунктов можно выбрать в фокус недели — как FOCUS_LIMIT на фронтенде.
FOCUS_LIMIT = 3

# Допустимые значения настроек — те же, что SETTINGS_RANGES на фронтенде.
SETTINGS_RANGES = {
    "daily_review_limit": (1, 100),
    "active_materials_limit": (1, 10),
    "new_notes_per_day": (1, 50),
}


@transaction.atomic
def create_default_areas(user) -> None:
    Area.objects.bulk_create(Area(user=user, order=order, **area) for order, area in enumerate(DEFAULT_AREAS))


def user_settings(user) -> UserSettings:
    settings, _ = UserSettings.objects.get_or_create(user=user, defaults=DEFAULT_SETTINGS)
    return settings

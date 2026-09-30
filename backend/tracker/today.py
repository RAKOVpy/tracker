"""«Сегодня» пользователя: фронтенд присылает свой часовой пояс в заголовке X-Timezone."""

from datetime import date
from zoneinfo import ZoneInfo

from .defaults import user_settings
from .rules.dates import today_in, zone

UTC = ZoneInfo("UTC")


def request_zone(request) -> ZoneInfo:
    """Пояс из заголовка запроса, иначе сохранённый в настройках, иначе UTC."""
    header = zone(request.headers.get("X-Timezone"))
    if header is not None:
        return header
    if request.user.is_authenticated:
        stored = zone(user_settings(request.user).timezone)
        if stored is not None:
            return stored
    return UTC


def request_today(request) -> date:
    return today_in(request_zone(request))

"""Календарные даты — как lib/dates.ts на фронтенде: без часов и часовых поясов."""

import calendar
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def add_days(d: date, days: int) -> date:
    return d + timedelta(days=days)


def add_months(d: date, months: int) -> date:
    """Сдвиг на месяцы: 31 января + 1 месяц = 28 (29) февраля."""
    index = d.year * 12 + d.month - 1 + months
    year, month = divmod(index, 12)
    last = calendar.monthrange(year, month + 1)[1]
    return date(year, month + 1, min(d.day, last))


def months_between(start: date, end: date) -> int:
    """Число месяцев по календарю, без учёта дней: с 31 янв по 1 фев — 1."""
    return (end.year - start.year) * 12 + (end.month - start.month)


def diff_days(start: date, end: date) -> int:
    return (end - start).days


def week_start(d: date) -> date:
    """Понедельник недели, в которую попадает дата."""
    return d - timedelta(days=d.weekday())


def zone(name: str | None) -> ZoneInfo | None:
    """Часовой пояс по имени IANA; None — если имя пустое или неизвестное."""
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def today_in(tz: ZoneInfo, now: datetime | None = None) -> date:
    return (now or datetime.now(tz)).astimezone(tz).date()

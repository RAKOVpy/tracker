"""Проверка отпуска — перенос vacationError из frontend/src/domain/vacation.ts."""

from collections.abc import Iterable
from datetime import date


def vacation_end(start: date, end: date | None, today: date) -> date:
    """Последний день отпуска; у отпуска «пока не выключу» — сегодня (или день начала, если он впереди)."""
    return end if end is not None else max(today, start)


def vacation_error(start: date, end: date | None, existing: Iterable[tuple[date, date | None]], today: date) -> str | None:
    if end is not None and end < start:
        return "Отпуск не может закончиться раньше, чем начался."
    if end is None and start > today:
        return "Отпуск без даты окончания начинается сегодня. Для будущего отпуска укажите, когда он закончится."
    others = list(existing)
    input_end = vacation_end(start, end, today)
    if end is None and any(other_start > input_end for other_start, _ in others):
        return "Дальше уже запланирован отпуск. Укажите дату окончания, чтобы отпуска не пересеклись."
    for other_start, other_end in others:
        other_last = vacation_end(other_start, other_end, today)
        overlaps = start <= other_last and other_start <= input_end
        # Отпуск «пока не выключу» может тянуться в будущее, поэтому после него новый начать нельзя.
        after_open = other_end is None and start > other_last
        if overlaps or after_open:
            return "На эти дни уже есть отпуск."
    return None

"""
Повторяющиеся задачи — перенос frontend/src/domain/recurrence.ts. Правила должны совпадать
с фронтендом до дня: тесты сверяют обе реализации на одних и тех же примерах.

Повторы идут по расписанию от `start`: «каждое вс» остаётся воскресеньем, даже если один раз
задачу перенесли. Следующий повтор — всегда после сегодняшнего дня и после даты текущего.
"""

from dataclasses import dataclass
from datetime import date

from .dates import add_days, add_months, diff_days, months_between, week_start

UNITS = ("day", "week", "month", "year")
INTERVAL_MAX = 99


class RuleError(ValueError):
    """Правило повтора записано неверно."""


@dataclass(frozen=True)
class Rule:
    unit: str
    interval: int
    # 0 — пн … 6 — вс, как date.weekday(); только у недельного повтора.
    weekdays: tuple[int, ...]
    start: date

    def to_json(self) -> dict:
        return {"unit": self.unit, "interval": self.interval, "weekdays": list(self.weekdays), "start": self.start.isoformat()}


def parse_rule(raw: object) -> Rule:
    """Проверяет правило из JSON и приводит его к каноническому виду (дни недели по порядку, без повторов)."""
    if not isinstance(raw, dict):
        raise RuleError("Повтор должен быть объектом")
    unit = raw.get("unit")
    if unit not in UNITS:
        raise RuleError("Неизвестная единица повтора")
    interval = raw.get("interval")
    if isinstance(interval, bool) or not isinstance(interval, int) or not 1 <= interval <= INTERVAL_MAX:
        raise RuleError(f"Шаг повтора должен быть целым числом от 1 до {INTERVAL_MAX}")
    weekdays = raw.get("weekdays")
    if not isinstance(weekdays, list) or any(isinstance(d, bool) or not isinstance(d, int) or not 0 <= d <= 6 for d in weekdays):
        raise RuleError("Дни недели — числа от 0 до 6")
    days = tuple(sorted(set(weekdays)))
    if unit == "week" and not days:
        raise RuleError("У недельного повтора не выбраны дни")
    start_raw = raw.get("start")
    try:
        start = date.fromisoformat(start_raw) if isinstance(start_raw, str) and len(start_raw) == 10 else None
    except ValueError:
        start = None
    if start is None:
        raise RuleError("Начало повтора должно быть датой ГГГГ-ММ-ДД")
    return Rule(unit, interval, days if unit == "week" else (), start)


def _month_step(rule: Rule) -> int:
    return (12 if rule.unit == "year" else 1) * rule.interval


def is_occurrence(rule: Rule, d: date) -> bool:
    if d < rule.start:
        return False
    if rule.unit == "day":
        return diff_days(rule.start, d) % rule.interval == 0
    if rule.unit == "week":
        weeks = diff_days(week_start(rule.start), week_start(d)) // 7
        return d.weekday() in rule.weekdays and weeks % rule.interval == 0
    months = months_between(rule.start, d)
    return months % _month_step(rule) == 0 and add_months(rule.start, months) == d


def next_occurrence(rule: Rule, after: date) -> date:
    """Ближайший повтор строго после даты."""
    start = max(add_days(after, 1), rule.start)
    if rule.unit == "day":
        steps = -(-diff_days(rule.start, start) // rule.interval)  # деление с округлением вверх
        return add_days(rule.start, steps * rule.interval)
    if rule.unit == "week":
        # В любом окне из interval недель есть «своя» неделя, а в ней — нужный день.
        for i in range(7 * (rule.interval + 1)):
            d = add_days(start, i)
            if is_occurrence(rule, d):
                return d
        raise RuleError("В недельном повторе не выбраны дни")
    step = _month_step(rule)
    months = -(-months_between(rule.start, start) // step) * step
    while add_months(rule.start, months) < start:
        months += step
    return add_months(rule.start, months)


def first_occurrence(rule: Rule, since: date) -> date:
    """Первый повтор в этот день или позже."""
    return next_occurrence(rule, add_days(since, -1))


def occurrence_on_or_before(rule: Rule, d: date) -> date | None:
    """Последний повтор в этот день или раньше; None — расписание ещё не началось."""
    if d < rule.start:
        return None
    if rule.unit == "day":
        return add_days(rule.start, diff_days(rule.start, d) // rule.interval * rule.interval)
    if rule.unit == "week":
        for i in range(7 * (rule.interval + 1)):
            day = add_days(d, -i)
            if day < rule.start:
                return None
            if is_occurrence(rule, day):
                return day
        return None
    step = _month_step(rule)
    months = months_between(rule.start, d) // step * step
    while months >= 0 and add_months(rule.start, months) > d:
        months -= step
    return add_months(rule.start, months) if months >= 0 else None


def next_dates(rule: Rule, planned_date: date | None, deadline: date | None, today: date) -> tuple[date | None, date | None]:
    """
    Даты следующего повтора закрытой задачи. «Когда делаю» (или дедлайн, если плана нет) встаёт
    на следующий повтор; дедлайн при плане сдвигается на шаг расписания — разрыв сохраняется.
    """
    anchor = planned_date or deadline or rule.start
    # Повтор, к которому относится задача: её могли перенести с вс на вт, но это повтор воскресенья.
    current = occurrence_on_or_before(rule, anchor) or anchor
    upcoming = next_occurrence(rule, max(anchor, today))
    has_plan = planned_date is not None or deadline is None
    if not has_plan:
        return None, upcoming
    return upcoming, None if deadline is None else add_days(deadline, diff_days(current, upcoming))

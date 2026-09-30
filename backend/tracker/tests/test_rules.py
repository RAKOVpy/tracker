"""Правила повторов и отпусков — те же примеры, что в тестах фронтенда (recurrence.test.ts, vacation.test.ts)."""

import random
from datetime import date

import pytest

from tracker.rules.dates import add_days, add_months, months_between
from tracker.rules.recurrence import (
    Rule,
    RuleError,
    first_occurrence,
    is_occurrence,
    next_dates,
    next_occurrence,
    occurrence_on_or_before,
    parse_rule,
)
from tracker.rules.vacations import vacation_error

MON = date(2026, 10, 5)
WED = date(2026, 10, 7)
SUN = date(2026, 10, 11)


def rule(unit="day", interval=1, weekdays=(), start=MON) -> Rule:
    return Rule(unit, interval, tuple(weekdays), start)


def test_add_months_clamps_to_month_end():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2026, 11, 15), 2) == date(2027, 1, 15)
    assert months_between(date(2026, 1, 31), date(2026, 2, 1)) == 1


@pytest.mark.parametrize(
    ("r", "after", "expected"),
    [
        (rule(), WED, date(2026, 10, 8)),
        (rule(interval=3), WED, date(2026, 10, 8)),
        (rule(interval=3), date(2026, 9, 1), MON),
        (rule("week", weekdays=[6]), WED, SUN),
        (rule("week", weekdays=[6]), SUN, date(2026, 10, 18)),
        (rule("week", weekdays=[0, 3]), WED, date(2026, 10, 8)),
        (rule("week", interval=2, weekdays=[0]), MON, date(2026, 10, 19)),
        (rule("month", start=date(2026, 1, 31)), date(2026, 2, 1), date(2026, 2, 28)),
        (rule("month", start=date(2026, 1, 31)), date(2026, 2, 28), date(2026, 3, 31)),
        (rule("month", interval=3, start=date(2026, 1, 15)), date(2026, 4, 15), date(2026, 7, 15)),
        (rule("year", start=date(2024, 2, 29)), date(2024, 3, 1), date(2025, 2, 28)),
    ],
)
def test_next_occurrence(r, after, expected):
    assert next_occurrence(r, after) == expected


def test_schedule_matches_brute_force():
    """nextOccurrence и occurrenceOnOrBefore — ближайшие даты, для которых is_occurrence."""
    rnd = random.Random(7)
    for _ in range(400):
        unit = rnd.choice(["day", "week", "month", "year"])
        start = add_days(date(2024, 1, 1), rnd.randrange(900))
        days = tuple(d for d in range(7) if rnd.random() < 0.3) or (start.weekday(),)
        r = Rule(unit, rnd.randint(1, 4), days if unit == "week" else (), start)
        d = add_days(start, rnd.randrange(500) - 60)

        expected_next = add_days(d, 1)
        while not is_occurrence(r, expected_next):
            expected_next = add_days(expected_next, 1)
        assert next_occurrence(r, d) == expected_next, (r, d)

        expected_prev: date | None = d
        while expected_prev is not None and not is_occurrence(r, expected_prev):
            expected_prev = add_days(expected_prev, -1) if expected_prev > r.start else None
        assert occurrence_on_or_before(r, d) == expected_prev, (r, d)


def test_first_occurrence():
    assert first_occurrence(rule("week", weekdays=[2]), WED) == WED
    assert first_occurrence(rule("week", weekdays=[6]), WED) == SUN


class TestParseRule:
    def test_canonical(self):
        parsed = parse_rule({"unit": "week", "interval": 2, "weekdays": [3, 0, 3], "start": "2026-10-05"})
        assert parsed == Rule("week", 2, (0, 3), MON)
        assert parsed.to_json() == {"unit": "week", "interval": 2, "weekdays": [0, 3], "start": "2026-10-05"}
        assert parse_rule({"unit": "month", "interval": 1, "weekdays": [1], "start": "2026-10-05"}).weekdays == ()

    @pytest.mark.parametrize(
        ("raw", "message"),
        [
            ({"unit": "hour", "interval": 1, "weekdays": [], "start": "2026-10-05"}, "единица"),
            ({"unit": "day", "interval": 0, "weekdays": [], "start": "2026-10-05"}, "Шаг"),
            ({"unit": "day", "interval": True, "weekdays": [], "start": "2026-10-05"}, "Шаг"),
            ({"unit": "day", "interval": 100, "weekdays": [], "start": "2026-10-05"}, "Шаг"),
            ({"unit": "week", "interval": 1, "weekdays": [], "start": "2026-10-05"}, "не выбраны"),
            ({"unit": "week", "interval": 1, "weekdays": [7], "start": "2026-10-05"}, "Дни недели"),
            ({"unit": "day", "interval": 1, "weekdays": [], "start": "5 окт"}, "Начало"),
            ({"unit": "day", "interval": 1, "weekdays": [], "start": "2026-02-30"}, "Начало"),
            ([], "объектом"),
        ],
    )
    def test_errors(self, raw, message):
        with pytest.raises(RuleError, match=message):
            parse_rule(raw)


class TestNextDates:
    sundays = rule("week", weekdays=[6], start=SUN)

    def test_next_week(self):
        assert next_dates(self.sundays, SUN, None, SUN) == (date(2026, 10, 18), None)

    def test_done_early_goes_after_task_date(self):
        assert next_dates(self.sundays, SUN, None, WED) == (date(2026, 10, 18), None)

    def test_late_goes_after_today_without_chain(self):
        daily = rule(start=date(2026, 10, 1))
        assert next_dates(daily, date(2026, 10, 1), None, WED) == (date(2026, 10, 8), None)

    def test_moved_repeat_returns_to_schedule_and_deadline_keeps_gap(self):
        assert next_dates(self.sundays, date(2026, 10, 13), date(2026, 10, 12), date(2026, 10, 13)) == (
            date(2026, 10, 18),
            date(2026, 10, 19),
        )

    def test_deadline_only(self):
        rent = rule("month", start=date(2026, 10, 10))
        assert next_dates(rent, None, date(2026, 10, 10), WED) == (None, date(2026, 11, 10))


class TestVacations:
    today = date(2026, 10, 7)

    def test_ok(self):
        assert vacation_error(date(2026, 10, 10), date(2026, 10, 12), [], self.today) is None

    def test_end_before_start(self):
        assert "раньше" in vacation_error(date(2026, 10, 10), date(2026, 10, 9), [], self.today)

    def test_open_in_future(self):
        assert "начинается сегодня" in vacation_error(date(2026, 10, 10), None, [], self.today)

    def test_overlap(self):
        existing = [(date(2026, 10, 1), date(2026, 10, 3))]
        assert vacation_error(date(2026, 10, 3), date(2026, 10, 5), existing, self.today) == "На эти дни уже есть отпуск."
        assert vacation_error(date(2026, 10, 4), date(2026, 10, 5), existing, self.today) is None

    def test_after_open_vacation(self):
        existing = [(date(2026, 10, 1), None)]
        assert vacation_error(date(2026, 10, 20), date(2026, 10, 21), existing, self.today) == "На эти дни уже есть отпуск."

    def test_open_before_planned(self):
        existing = [(date(2026, 10, 20), date(2026, 10, 25))]
        assert "Дальше уже запланирован" in vacation_error(date(2026, 10, 7), None, existing, self.today)

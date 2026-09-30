"""Демо-аккаунт: данные проходят проверки загрузки, согласованы с хранилищем Obsidian и выглядят «живыми» в любой день."""

import json
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from tracker.backup import import_data
from tracker.demo import DEMO_EMAIL, DEMO_PASSWORD
from tracker.demo.build import VAULT_MANIFEST, DemoBuilder, obsidian_uri, schedule, shift_for_vacations
from tracker.models import Goal, Note, Task, WeeklyReview

from .conftest import make_user

VAULT_DIR = Path(__file__).resolve().parents[3] / "obsidian" / "example-vault"
# Неделя: от понедельника до воскресенья — демо должно выглядеть живым в любой день.
WEEK = [date(2026, 9, 28) + timedelta(days=i) for i in range(7)]


def due_date(builder: DemoBuilder, note: dict, reviews: list[dict]) -> date:
    """Срок повторения так, как его считает фронтенд (computeNoteState)."""
    step, anchor, interval = 0, date.fromisoformat(note["added_on"]), 1
    for review in sorted(reviews, key=lambda r: (r["date"], r["created_at"])):
        interval, step = schedule(step, review["rating"])
        anchor = date.fromisoformat(review["date"])
    return shift_for_vacations(anchor, anchor + timedelta(days=interval), builder.vacations, builder.today)


def test_manifest_matches_vault_files():
    manifest = json.loads(VAULT_MANIFEST.read_text("utf-8"))
    paths = [item["path"] for item in manifest["notes"] + manifest["materials"]]
    assert paths and all((VAULT_DIR / path).is_file() for path in paths)


def test_obsidian_uri_like_frontend():
    # То же значение проверяет obsidian/parse.test.ts для obsidianUri.
    assert obsidian_uri("Мой вольт", "Заметки/Двоичный поиск.md") == (
        "obsidian://open?vault=%D0%9C%D0%BE%D0%B9%20%D0%B2%D0%BE%D0%BB%D1%8C%D1%82"
        "&file=%D0%97%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8%2F%D0%94%D0%B2%D0%BE%D0%B8%D1%87%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA"
    )


@pytest.mark.parametrize("today", WEEK, ids=lambda d: d.strftime("%a"))
def test_demo_looks_alive_any_day(user, today):
    builder = DemoBuilder(today)
    data = builder.build()
    import_data(user, data)
    iso = today.isoformat()

    # Заметки: несколько ждут повторения сегодня и пара — с прошлых дней, как у того, кто повторяет не всегда вовремя.
    reviews: dict[str, list[dict]] = {}
    for review in data["reviews"]:
        reviews.setdefault(review["note_id"], []).append(review)
    dues = [due_date(builder, n, reviews.get(n["id"], [])) for n in data["notes"] if n["status"] == "active"]
    assert sum(d == today for d in dues) >= 5
    assert sum(d < today for d in dues) == 2
    assert all(r["date"] < iso for r in data["reviews"])

    # Заметки из хранилища — те же, что даст синхронизация.
    manifest = {n["path"]: n for n in json.loads(VAULT_MANIFEST.read_text("utf-8"))["notes"]}
    linked = [n for n in data["notes"] if n["obsidian_path"]]
    assert len(linked) == 17
    for note in linked:
        parsed = manifest[note["obsidian_path"]]
        assert (note["title"], note["questions"], note["summary"]) == (parsed["title"], parsed["questions"], parsed["summary"])
        assert note["obsidian_uri"] == obsidian_uri("example-vault", note["obsidian_path"])

    # Привычки сегодня ещё не отмечены, в отпуске ничего не отмечено и не повторено.
    vacation = builder.vacation
    in_vacation = lambda value: vacation[0].isoformat() <= value <= vacation[1].isoformat()  # noqa: E731
    assert all(e["date"] < iso for e in data["entries"])
    assert not any(in_vacation(e["date"]) for e in data["entries"])
    assert not any(in_vacation(r["date"]) for r in data["reviews"])

    # У каждой повторяющейся задачи открыт один повтор — не раньше сегодня; закрытые — с датой закрытия.
    tasks = Task.objects.filter(user=user)
    chains = {t.title for t in tasks if t.recurrence}
    for title in chains:
        open_ = [t for t in tasks if t.title == title and t.status == "todo"]
        assert len(open_) == 1
        assert (open_[0].planned_date or open_[0].deadline) >= today
    assert all(t.completed_at for t in tasks if t.status in ("done", "cancelled"))
    assert tasks.filter(status="inbox").count() == 5

    # Фокус на эту неделю — из обзора прошлой недели; эта неделя ещё не подведена.
    monday = today - timedelta(days=today.weekday())
    assert WeeklyReview.objects.filter(user=user, week_start=monday - timedelta(days=7)).exists()
    assert not WeeklyReview.objects.filter(user=user, week_start=monday).exists()
    assert Goal.objects.filter(user=user, kind="habit", status="active").count() == 4


def login(email: str, password: str) -> int:
    client = APIClient(enforce_csrf_checks=True)
    token = client.get("/api/auth/session/").cookies["csrftoken"].value
    return client.post("/api/auth/login/", {"email": email, "password": password}, format="json", HTTP_X_CSRFTOKEN=token).status_code


@pytest.mark.django_db
def test_command_creates_and_recreates_demo():
    call_command("demo", "--today", "2026-09-30", stdout=StringIO())
    assert login(DEMO_EMAIL, DEMO_PASSWORD) == 200
    user = get_user_model().objects.get(username=DEMO_EMAIL)
    notes = Note.objects.filter(user=user).count()
    Task.objects.filter(user=user).delete()

    # Повторный запуск: данные собраны заново, в том числе удалённое; пароль можно сменить.
    call_command("demo", "--today", "2026-10-01", "--password", "another-pass", stdout=StringIO())
    assert Note.objects.filter(user=user).count() == notes
    assert Task.objects.filter(user=user).exists()
    assert login(DEMO_EMAIL, "another-pass") == 200


@pytest.mark.django_db
def test_command_does_not_touch_real_account():
    real = make_user("me@example.com")
    with pytest.raises(CommandError, match="создан не этой командой"):
        call_command("demo", "--email", "me@example.com")
    assert not Note.objects.filter(user=real).exists()


@pytest.mark.django_db
def test_vault_name_for_links():
    call_command("demo", "--vault-name", "Мои заметки", stdout=StringIO())
    note = Note.objects.filter(user__username=DEMO_EMAIL).exclude(obsidian_path=None).first()
    assert note.obsidian_uri == obsidian_uri("Мои заметки", note.obsidian_path)

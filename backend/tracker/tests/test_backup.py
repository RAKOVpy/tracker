"""
Резервная копия: загрузка копии фронтенда (пример данных из браузера, схема v9), выгрузка
в том же формате, проверка и починка ссылок, сброс и запись результата синхронизации с Obsidian.
"""

import copy
import json
import uuid
from pathlib import Path

import pytest
from django.utils.dateparse import parse_datetime

from tracker.models import Area, Material, Note, Task

pytestmark = pytest.mark.django_db

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "frontend-demo.json").read_text())


def backup(**changes) -> dict:
    data = copy.deepcopy(FIXTURE)
    data.update(changes)
    return data


def comparable(db: dict) -> dict:
    """Копия без id: ссылки заменены названиями, время — моментом, чтобы сравнивать разные id и форматы."""
    areas = {a["id"]: a["name"] for a in db["areas"]}
    goals = {g["id"]: g["title"] for g in db["goals"]}
    materials = {m["id"]: m for m in db["materials"]}
    notes = {n["id"]: n["title"] for n in db["notes"]}
    projects = {p["id"]: p for p in db["projects"]}
    tasks = {t["id"]: t for t in db["tasks"]}

    def moment(value):
        return parse_datetime(value) if value else None

    def part(material_id, part_id):
        material = materials.get(material_id)
        return next((p["title"] for p in material["parts"] if p["id"] == part_id), None) if material else None

    def milestone(project_id, milestone_id):
        project = projects.get(project_id)
        return next((m["title"] for m in project["milestones"] if m["id"] == milestone_id), None) if project else None

    def key(item):
        return json.dumps(item, sort_keys=True, ensure_ascii=False, default=str)

    return {
        "areas": sorted(key({**a, "id": None, "createdAt": moment(a["createdAt"])}) for a in db["areas"]),
        # Числа сравниваем как числа: сервер отдаёт 12.0, фронтенд хранил 12 — для JSON это одно и то же.
        "goals": sorted(
            key({**g, "id": None, "areaId": areas.get(g["areaId"]), "targetValue": float(g["targetValue"]), "createdAt": moment(g["createdAt"])})
            for g in db["goals"]
        ),
        "entries": sorted(
            key({**e, "id": None, "goalId": goals[e["goalId"]], "value": float(e["value"]), "createdAt": moment(e["createdAt"])}) for e in db["entries"]
        ),
        "materials": sorted(
            key({**m, "id": None, "areaId": areas.get(m["areaId"]), "parts": [{**p, "id": None} for p in m["parts"]], "createdAt": moment(m["createdAt"])})
            for m in db["materials"]
        ),
        "notes": sorted(
            key({**n, "id": None, "materialId": materials[n["materialId"]]["title"] if n["materialId"] else None, "createdAt": moment(n["createdAt"])})
            for n in db["notes"]
        ),
        "reviews": sorted(key({**r, "id": None, "noteId": notes[r["noteId"]], "createdAt": moment(r["createdAt"])}) for r in db["reviews"]),
        "settings": db["settings"],
        "vacations": sorted(key({**v, "id": None, "createdAt": moment(v["createdAt"])}) for v in db["vacations"]),
        "projects": sorted(
            key({
                **p, "id": None, "areaId": areas.get(p["areaId"]), "goalId": goals.get(p["goalId"]),
                "milestones": [{**m, "id": None} for m in p["milestones"]],
                "completedAt": moment(p["completedAt"]), "createdAt": moment(p["createdAt"]),
            })
            for p in db["projects"]
        ),
        "weeklyReviews": sorted(
            key({**r, "id": None, "focus": [{**f, "id": None} for f in r["focus"]], "createdAt": moment(r["createdAt"])})
            for r in db["weeklyReviews"]
        ),
        "tasks": sorted(
            key({
                **t, "id": None, "areaId": areas.get(t["areaId"]),
                "projectId": projects[t["projectId"]]["title"] if t["projectId"] else None,
                "milestoneId": milestone(t["projectId"], t["milestoneId"]),
                "materialId": materials[t["materialId"]]["title"] if t["materialId"] else None,
                "partId": part(t["materialId"], t["partId"]),
                "repeatOf": (tasks[t["repeatOf"]]["title"], tasks[t["repeatOf"]]["status"]) if t["repeatOf"] else None,
                "completedAt": moment(t["completedAt"]), "createdAt": moment(t["createdAt"]),
            })
            for t in db["tasks"]
        ),
    }


def test_frontend_backup_round_trip(api):
    assert api.post("/api/import/", FIXTURE, format="json").status_code == 204
    exported = api.get("/api/export/").json()
    assert exported["app"] == "tracker" and exported["version"] == 9 and parse_datetime(exported["exportedAt"])
    # В примере есть и цели к сроку, и привычки, и обзор недели.
    assert {g["kind"] for g in exported["goals"]} == {"target", "habit"} and exported["weeklyReviews"]
    assert comparable(exported) == comparable(FIXTURE)
    # id новые — копия не мешает другим аккаунтам.
    assert {a["id"] for a in exported["areas"]}.isdisjoint({a["id"] for a in FIXTURE["areas"]})
    # И выгруженную копию можно загрузить снова.
    assert api.post("/api/import/", exported, format="json").status_code == 204
    assert comparable(api.get("/api/export/").json()) == comparable(FIXTURE)


def test_imported_data_is_live(api):
    """После загрузки всё работает как обычно: повтор задачи из копии порождает следующий."""
    api.post("/api/import/", FIXTURE, format="json")
    repeating = Task.objects.filter(recurrence__isnull=False, status="todo").exclude(repeats__isnull=False).first()
    response = api.patch(f"/api/tasks/{repeating.id}/", {"status": "done"}, format="json")
    assert response.status_code == 200
    assert Task.objects.filter(repeat_of=repeating).count() == 1


def test_two_accounts_import_same_backup(api, other):
    assert api.post("/api/import/", FIXTURE, format="json").status_code == 204
    assert other.post("/api/import/", FIXTURE, format="json").status_code == 204
    assert len(api.get("/api/tasks/").json()) == len(other.get("/api/tasks/").json()) == len(FIXTURE["tasks"])


def test_import_replaces_everything(api, user):
    api.post("/api/tasks/", {"title": "Старая", "status": "todo"}, format="json")
    api.post("/api/import/", FIXTURE, format="json")
    assert not Task.objects.filter(user=user, title="Старая").exists()
    assert Area.objects.filter(user=user).count() == len(FIXTURE["areas"])


def test_dangling_references_are_fixed(api):
    data = backup()
    task = data["tasks"][0]
    task.update(areaId="нет-такой", projectId="нет", milestoneId="нет", materialId="нет", partId="нет", repeatOf="нет")
    data["notes"][0]["materialId"] = "нет"
    data["entries"].append({**data["entries"][0], "id": "e-lost", "goalId": "нет"})
    data["reviews"].append({**data["reviews"][0], "id": "r-lost", "noteId": "нет"})
    assert api.post("/api/import/", data, format="json").status_code == 204
    exported = api.get("/api/export/").json()
    fixed = next(t for t in exported["tasks"] if t["title"] == task["title"] and t["createdAt"].startswith(task["createdAt"][:19]))
    assert [fixed[k] for k in ("areaId", "projectId", "milestoneId", "materialId", "partId", "repeatOf")] == [None] * 6
    assert len(exported["entries"]) == len(FIXTURE["entries"])
    assert len(exported["reviews"]) == len(FIXTURE["reviews"])


def test_milestone_from_other_project_is_dropped(api):
    data = backup()
    with_milestone = next(t for t in data["tasks"] if t["milestoneId"])
    other_project = next(p for p in data["projects"] if p["id"] != with_milestone["projectId"])
    with_milestone["milestoneId"] = other_project["milestones"][0]["id"]
    api.post("/api/import/", data, format="json")
    task = Task.objects.get(title=with_milestone["title"])
    assert task.project is not None and task.milestone is None


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda d: d.update(version=8), "другой версии"),
        (lambda d: next(g for g in d["goals"] if g["kind"] == "habit").update(daysPerWeek=8), "от 1 до 7"),
        (lambda d: next(g for g in d["goals"] if g["kind"] == "target").update(deadline=None), "«deadline»"),
        (lambda d: d["goals"][0].update(kind="routine"), "Цель 1: недопустимое значение поля «kind»"),
        (lambda d: d["weeklyReviews"][0].update(weekStart="2026-09-22"), "с понедельника"),
        (lambda d: d["weeklyReviews"].append({**copy.deepcopy(d["weeklyReviews"][0]), "id": "w2"}), "два обзора одной недели"),
        (
            lambda d: d["weeklyReviews"][0].update(focus=[{"id": f"f{i}", "text": "Дело", "done": False} for i in range(4)]),
            "не больше 3",
        ),
        (lambda d: d["tasks"][0].update(status="later"), "Задача 1: недопустимое значение поля «status»"),
        (lambda d: d["goals"][0].update(deadline="2020-01-01", startDate="2020-02-01"), "дедлайн раньше даты старта"),
        (lambda d: d["tasks"].append(copy.deepcopy(d["tasks"][0])), "Задачи: повторяется id"),
        (lambda d: d["tasks"][0].update(recurrence={"unit": "week", "interval": 1, "weekdays": [], "start": "2026-10-05"}), "не выбраны дни"),
        (lambda d: d["materials"][0]["parts"].append({"id": "x", "title": "", "status": "todo"}), "часть"),
        (
            lambda d: d.update(vacations=[
                {"id": "v1", "start": "2026-10-01", "end": "2026-10-05", "createdAt": "x"},
                {"id": "v2", "start": "2026-10-04", "end": "2026-10-06", "createdAt": "x"},
            ]),
            "Отпуска пересекаются",
        ),
        (lambda d: d.update(areas="oops"), "Ожидался список: areas"),
    ],
)
def test_import_rejects_invalid_data_and_keeps_old(api, user, change, message):
    api.post("/api/tasks/", {"title": "Не пропаду", "status": "todo"}, format="json")
    data = backup()
    change(data)
    response = api.post("/api/import/", data, format="json")
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert Task.objects.filter(user=user, title="Не пропаду").exists()


def test_habit_fields_of_other_kind_are_dropped(api):
    """Как validateDb: срок у привычки и частота у цели к сроку не мешают загрузке, а отбрасываются."""
    data = backup()
    habit = next(g for g in data["goals"] if g["kind"] == "habit")
    target = next(g for g in data["goals"] if g["kind"] == "target")
    habit["deadline"], target["daysPerWeek"] = "2026-12-31", 3
    assert api.post("/api/import/", data, format="json").status_code == 204
    goals = {g["title"]: g for g in api.get("/api/goals/").json()}
    assert goals[habit["title"]]["deadline"] is None and goals[target["title"]]["daysPerWeek"] is None


def test_settings_are_clamped_on_import(api):
    api.post("/api/import/", backup(settings={"dailyReviewLimit": 500, "activeMaterialsLimit": "x", "newNotesPerDay": 3.4}), format="json")
    assert api.get("/api/settings/").json() == {"dailyReviewLimit": 100, "activeMaterialsLimit": 3, "newNotesPerDay": 3, "strictMode": False}


def test_reset(api, user):
    api.post("/api/import/", FIXTURE, format="json")
    api.patch("/api/settings/", {"strictMode": True}, format="json")
    assert api.post("/api/reset/").status_code == 204
    exported = api.get("/api/export/").json()
    assert [a["name"] for a in exported["areas"]] == ["Чтение", "Языки", "Спорт", "Учёба"]
    assert all(
        exported[k] == [] for k in ("goals", "entries", "materials", "notes", "reviews", "vacations", "tasks", "projects", "weeklyReviews")
    )
    assert exported["settings"]["strictMode"] is False


class TestObsidianApply:
    def test_creates_and_updates_without_touching_tracker_fields(self, api, user):
        note = api.post("/api/notes/", {"title": "Графы", "questions": ["Старый вопрос"], "addedOn": "2026-09-01"}, format="json").json()
        api.patch(f"/api/notes/{note['id']}/", {"status": "paused"}, format="json")
        material_id, new_note_id = str(uuid.uuid4()), str(uuid.uuid4())
        body = {
            "materials": [
                {"id": material_id, "title": "Алгоритмы", "type": "course", "author": "", "url": "", "areaId": None,
                 "status": "active", "parts": [], "obsidianPath": "Материалы/Алгоритмы.md", "createdAt": "x"},
            ],
            "notes": [
                {**note, "questions": ["Новый вопрос"], "materialId": material_id, "obsidianPath": "Заметки/Графы.md",
                 "obsidianUri": "obsidian://open?vault=V&file=Графы", "status": "active", "addedOn": "2026-10-10"},
                {"id": new_note_id, "title": "Хеши", "materialId": material_id, "questions": ["Что такое коллизия?"], "summary": "",
                 "obsidianUri": "", "status": "active", "addedOn": "2026-10-12", "obsidianPath": "Заметки/Хеши.md", "createdAt": "x"},
            ],
        }
        response = api.post("/api/obsidian/apply/", body, format="json")
        assert response.status_code == 200
        assert response.json() == {"materials": 1, "notes": 2}

        updated = Note.objects.get(id=note["id"])
        assert updated.questions == ["Новый вопрос"] and updated.obsidian_path == "Заметки/Графы.md"
        # Статус и дата добавления ведутся в трекере.
        assert updated.status == "paused" and str(updated.added_on) == "2026-09-01"
        material = Material.objects.get(user=user)
        assert str(material.id) == material_id and material.obsidian_path == "Материалы/Алгоритмы.md"
        created = Note.objects.get(id=new_note_id)
        assert created.material == material and str(created.added_on) == "2026-10-12"

    def test_cannot_touch_other_users_objects(self, api, other):
        note = api.post("/api/notes/", {"title": "Моя", "questions": []}, format="json").json()
        body = {"notes": [{**note, "title": "Чужая правка"}]}
        other.post("/api/obsidian/apply/", body, format="json")
        assert Note.objects.get(id=note["id"]).title == "Моя"
        # Чужой id не занимается: у второго пользователя появилась своя заметка с новым id.
        theirs = Note.objects.get(title="Чужая правка")
        assert str(theirs.id) != note["id"]

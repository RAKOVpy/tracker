"""CRUD, проверки и изоляция пользователей для сфер, целей и привычек, записей, знаний, настроек, отпусков и обзоров недели."""

import uuid

import pytest

from tracker.models import Area, Goal, Material, Note, ProgressEntry, Review, Task, WeeklyReview

pytestmark = pytest.mark.django_db


def goal_body(**fields):
    return {
        "title": "Прочитать книгу",
        "description": "",
        "areaId": None,
        "unit": "стр.",
        "targetValue": 480,
        "startDate": "2026-10-01",
        "deadline": "2026-10-31",
        "priority": "high",
        **fields,
    }


class TestAreas:
    def test_list_and_create_appends_order(self, api):
        areas = api.get("/api/areas/").json()
        assert [a["name"] for a in areas] == ["Чтение", "Языки", "Спорт", "Учёба"]
        assert set(areas[0]) == {"id", "name", "color", "icon", "order", "createdAt"}
        created = api.post("/api/areas/", {"name": "Работа", "color": "teal", "icon": "work"}, format="json")
        assert created.status_code == 201
        assert created.json()["order"] == 4

    def test_invalid_color(self, api):
        response = api.post("/api/areas/", {"name": "Х", "color": "red", "icon": "work"}, format="json")
        assert response.status_code == 400
        assert "color" in response.json()["errors"]

    def test_delete_unlinks(self, api, user):
        area = Area.objects.filter(user=user).first()
        goal = api.post("/api/goals/", goal_body(areaId=str(area.id)), format="json").json()
        assert api.delete(f"/api/areas/{area.id}/").status_code == 204
        assert api.get(f"/api/goals/{goal['id']}/").json()["areaId"] is None


class TestIsolation:
    def test_other_user_cannot_see_or_change(self, api, other, user):
        area = Area.objects.filter(user=user).first()
        goal = api.post("/api/goals/", goal_body(), format="json").json()
        assert len(other.get("/api/goals/").json()) == 0
        assert other.get(f"/api/goals/{goal['id']}/").status_code == 404
        assert other.patch(f"/api/goals/{goal['id']}/", {"title": "взлом"}, format="json").status_code == 404
        assert other.delete(f"/api/areas/{area.id}/").status_code == 404
        assert api.get(f"/api/goals/{goal['id']}/").json()["title"] == "Прочитать книгу"

    def test_cannot_reference_other_users_objects(self, api, other, user):
        area = Area.objects.filter(user=user).first()
        response = other.post("/api/goals/", goal_body(areaId=str(area.id)), format="json")
        assert response.status_code == 400
        goal = api.post("/api/goals/", goal_body(), format="json").json()
        entry = other.post("/api/entries/", {"goalId": goal["id"], "date": "2026-10-02", "value": 5}, format="json")
        assert entry.status_code == 400

    def test_invalid_uuid_reference_is_400(self, api):
        response = api.post("/api/goals/", goal_body(areaId="not-a-uuid"), format="json")
        assert response.status_code == 400


class TestGoalsAndEntries:
    def test_goal_validation(self, api):
        assert api.post("/api/goals/", goal_body(deadline="2026-09-01"), format="json").status_code == 400
        assert api.post("/api/goals/", goal_body(targetValue=0), format="json").status_code == 400
        goal = api.post("/api/goals/", goal_body(), format="json").json()
        assert goal["status"] == "active"
        assert goal["targetValue"] == 480
        # Частичная правка сверяет новый дедлайн со старым стартом.
        assert api.patch(f"/api/goals/{goal['id']}/", {"deadline": "2026-09-01"}, format="json").status_code == 400
        assert api.patch(f"/api/goals/{goal['id']}/", {"status": "archived"}, format="json").json()["status"] == "archived"

    def test_entries_filter_and_cascade(self, api):
        a = api.post("/api/goals/", goal_body(), format="json").json()
        b = api.post("/api/goals/", goal_body(title="Другая"), format="json").json()
        for goal, value in ((a, 20), (a, 0.5), (b, 3)):
            response = api.post("/api/entries/", {"goalId": goal["id"], "date": "2026-10-02", "value": value, "note": ""}, format="json")
            assert response.status_code == 201
        assert len(api.get("/api/entries/").json()) == 3
        assert [e["value"] for e in api.get(f"/api/entries/?goal={a['id']}").json()] == [20, 0.5]
        assert api.get("/api/entries/?goal=oops").status_code == 400
        assert api.post("/api/entries/", {"goalId": a["id"], "date": "2026-10-02", "value": -1}, format="json").status_code == 400
        api.delete(f"/api/goals/{a['id']}/")
        assert ProgressEntry.objects.count() == 1


def habit_body(**fields):
    return {
        "kind": "habit",
        "title": "Английский",
        "description": "",
        "areaId": None,
        "unit": "минут",
        "targetValue": 20,
        "startDate": "2026-10-01",
        "deadline": None,
        "daysPerWeek": 7,
        "priority": "medium",
        **fields,
    }


class TestHabits:
    def test_create_habit_and_target_by_default(self, api):
        habit = api.post("/api/goals/", habit_body(), format="json")
        assert habit.status_code == 201
        assert {k: habit.json()[k] for k in ("kind", "deadline", "daysPerWeek", "targetValue")} == {
            "kind": "habit",
            "deadline": None,
            "daysPerWeek": 7,
            "targetValue": 20,
        }
        # Без kind — цель к сроку, как раньше.
        goal = api.post("/api/goals/", goal_body(), format="json").json()
        assert goal["kind"] == "target" and goal["daysPerWeek"] is None

    def test_validation(self, api):
        assert api.post("/api/goals/", habit_body(daysPerWeek=0), format="json").status_code == 400
        assert api.post("/api/goals/", habit_body(daysPerWeek=8), format="json").status_code == 400
        missing = api.post("/api/goals/", habit_body(daysPerWeek=None), format="json")
        assert missing.status_code == 400 and "от 1 до 7" in missing.json()["detail"]
        zero = api.post("/api/goals/", habit_body(targetValue=0), format="json")
        assert "Норма за день" in zero.json()["detail"]
        no_deadline = api.post("/api/goals/", goal_body(deadline=None), format="json")
        assert no_deadline.status_code == 400 and "срок" in no_deadline.json()["detail"]

    def test_fields_of_other_kind_are_dropped(self, api):
        """Срок привычке и частота цели к сроку не нужны — они обнуляются, как в applyGoalPatch."""
        habit = api.post("/api/goals/", habit_body(deadline="2026-12-31"), format="json").json()
        assert habit["deadline"] is None
        goal = api.post("/api/goals/", goal_body(daysPerWeek=3), format="json").json()
        assert goal["daysPerWeek"] is None
        assert api.patch(f"/api/goals/{goal['id']}/", {"daysPerWeek": 5}, format="json").json()["daysPerWeek"] is None

    def test_patch_keeps_kind(self, api):
        habit = api.post("/api/goals/", habit_body(), format="json").json()
        updated = api.patch(f"/api/goals/{habit['id']}/", {"daysPerWeek": 3, "targetValue": 30}, format="json")
        assert updated.status_code == 200 and updated.json()["daysPerWeek"] == 3
        changed = api.patch(f"/api/goals/{habit['id']}/", {"kind": "target", "deadline": "2026-12-31"}, format="json")
        assert changed.status_code == 400 and "не меняется" in changed.json()["detail"]
        assert Goal.objects.get(id=habit["id"]).kind == "habit"

    def test_entries_work_for_habits(self, api):
        habit = api.post("/api/goals/", habit_body(), format="json").json()
        entry = api.post("/api/entries/", {"goalId": habit["id"], "date": "2026-10-02", "value": 20}, format="json")
        assert entry.status_code == 201
        api.delete(f"/api/goals/{habit['id']}/")
        assert ProgressEntry.objects.count() == 0


def review_body(**fields):
    return {
        "weekStart": "2026-09-28",
        "focus": [{"id": "f1", "text": "Доклад на семинаре", "done": False}],
        "reflection": "Получилось: зал три раза.",
        **fields,
    }


class TestWeeklyReviews:
    def test_create_list_update_delete(self, api):
        created = api.post("/api/weekly-reviews/", review_body(), format="json")
        assert created.status_code == 201
        review = created.json()
        assert set(review) == {"id", "weekStart", "focus", "reflection", "createdAt"}
        api.post("/api/weekly-reviews/", review_body(weekStart="2026-09-21", focus=[], reflection=""), format="json")
        assert [r["weekStart"] for r in api.get("/api/weekly-reviews/").json()] == ["2026-09-21", "2026-09-28"]
        ticked = [{**review["focus"][0], "done": True}]
        updated = api.patch(f"/api/weekly-reviews/{review['id']}/", {"focus": ticked}, format="json").json()
        assert updated["focus"] == ticked and updated["reflection"] == review["reflection"]
        assert api.delete(f"/api/weekly-reviews/{review['id']}/").status_code == 204
        assert WeeklyReview.objects.count() == 1

    def test_one_review_per_week(self, api, other):
        api.post("/api/weekly-reviews/", review_body(), format="json")
        again = api.post("/api/weekly-reviews/", review_body(), format="json")
        assert again.status_code == 400 and again.json()["detail"] == "Обзор этой недели уже есть."
        # У другого пользователя своя неделя.
        assert other.post("/api/weekly-reviews/", review_body(), format="json").status_code == 201

    def test_validation(self, api):
        tuesday = api.post("/api/weekly-reviews/", review_body(weekStart="2026-09-29"), format="json")
        assert tuesday.status_code == 400 and "понедельника" in tuesday.json()["detail"]
        four = [{"id": f"f{i}", "text": "Дело", "done": False} for i in range(4)]
        assert "не больше 3" in api.post("/api/weekly-reviews/", review_body(focus=four), format="json").json()["detail"]
        empty = api.post("/api/weekly-reviews/", review_body(focus=[{"id": "f1", "text": " ", "done": False}]), format="json")
        assert "Пункт фокуса 1" in empty.json()["detail"]
        review = api.post("/api/weekly-reviews/", review_body(), format="json").json()
        moved = api.patch(f"/api/weekly-reviews/{review['id']}/", {"weekStart": "2026-10-05"}, format="json")
        assert moved.status_code == 400

    def test_isolation(self, api, other):
        review = api.post("/api/weekly-reviews/", review_body(), format="json").json()
        assert other.get("/api/weekly-reviews/").json() == []
        assert other.patch(f"/api/weekly-reviews/{review['id']}/", {"reflection": "взлом"}, format="json").status_code == 404
        assert other.delete(f"/api/weekly-reviews/{review['id']}/").status_code == 404


class TestKnowledge:
    def test_material_with_parts(self, api):
        body = {
            "title": "Чистый код",
            "type": "book",
            "author": "",
            "url": "",
            "areaId": None,
            "status": "active",
            "parts": [{"title": "Глава 1"}, {"id": str(uuid.uuid4()), "title": "Глава 2", "status": "studied"}],
        }
        material = api.post("/api/materials/", body, format="json").json()
        assert [(p["title"], p["status"]) for p in material["parts"]] == [("Глава 1", "todo"), ("Глава 2", "studied")]
        assert material["parts"][1]["id"] == body["parts"][1]["id"]
        assert material["obsidianPath"] is None

        # Переименовать, переставить, удалить — список приводится к присланному.
        first, second = material["parts"]
        updated = api.patch(
            f"/api/materials/{material['id']}/",
            {"parts": [{**second, "title": "Глава 2. Смыслы"}, {"title": "Глава 3"}]},
            format="json",
        ).json()
        assert [p["title"] for p in updated["parts"]] == ["Глава 2. Смыслы", "Глава 3"]
        assert updated["parts"][0]["id"] == second["id"]
        # Правка без частей их не трогает.
        assert len(api.patch(f"/api/materials/{material['id']}/", {"status": "done"}, format="json").json()["parts"]) == 2

    def test_duplicate_part_ids_rejected(self, api):
        part_id = str(uuid.uuid4())
        body = {"title": "К", "type": "book", "status": "active", "parts": [{"id": part_id, "title": "А"}, {"id": part_id, "title": "Б"}]}
        assert api.post("/api/materials/", body, format="json").status_code == 400

    def test_foreign_part_id_is_replaced(self, api, other):
        material = api.post("/api/materials/", {"title": "М", "type": "book", "status": "active", "parts": [{"title": "А"}]}, format="json").json()
        stolen = material["parts"][0]["id"]
        theirs = other.post("/api/materials/", {"title": "Их", "type": "book", "status": "active", "parts": [{"id": stolen, "title": "Б"}]}, format="json").json()
        assert theirs["parts"][0]["id"] != stolen
        assert api.get(f"/api/materials/{material['id']}/").json()["parts"][0]["title"] == "А"

    def test_notes_and_reviews(self, api):
        material = api.post("/api/materials/", {"title": "М", "type": "course", "status": "active"}, format="json").json()
        note = api.post(
            "/api/notes/",
            {"title": "Графы", "materialId": material["id"], "questions": ["Чем BFS отличается от DFS?"], "summary": "", "obsidianUri": ""},
            format="json",
            HTTP_X_TIMEZONE="Pacific/Kiritimati",
        )
        assert note.status_code == 201
        note = note.json()
        assert note["status"] == "active"
        assert note["addedOn"]
        with_date = api.post("/api/notes/", {"title": "Импорт", "questions": [], "addedOn": "2026-09-01"}, format="json").json()
        assert with_date["addedOn"] == "2026-09-01"
        bad_uri = api.post("/api/notes/", {"title": "Х", "questions": [], "obsidianUri": "https://x"}, format="json")
        assert "obsidian://" in bad_uri.json()["detail"]

        review = api.post("/api/reviews/", {"noteId": note["id"], "date": "2026-10-02", "rating": "good", "explain": None, "taught": False}, format="json")
        assert review.status_code == 201
        assert api.patch(f"/api/notes/{note['id']}/", {"status": "paused"}, format="json").json()["status"] == "paused"
        api.delete(f"/api/materials/{material['id']}/")
        assert api.get(f"/api/notes/{note['id']}/").json()["materialId"] is None
        api.delete(f"/api/notes/{note['id']}/")
        assert Review.objects.count() == 0

    def test_material_delete_unlinks_tasks(self, api):
        material = api.post("/api/materials/", {"title": "М", "type": "book", "status": "active", "parts": [{"title": "А"}]}, format="json").json()
        part = material["parts"][0]["id"]
        task = api.post("/api/tasks/", {"title": "Конспект", "status": "todo", "materialId": material["id"], "partId": part}, format="json").json()
        api.patch(f"/api/materials/{material['id']}/", {"parts": []}, format="json")
        assert api.get(f"/api/tasks/{task['id']}/").json()["partId"] is None
        api.delete(f"/api/materials/{material['id']}/")
        assert api.get(f"/api/tasks/{task['id']}/").json()["materialId"] is None
        assert Material.objects.count() == 0 and Note.objects.count() == 0 and Task.objects.count() == 1


class TestSettings:
    def test_get_and_patch_with_ranges(self, api):
        assert api.get("/api/settings/").json() == {"dailyReviewLimit": 15, "activeMaterialsLimit": 3, "newNotesPerDay": 5, "strictMode": False}
        assert api.patch("/api/settings/", {"dailyReviewLimit": 20, "strictMode": True}, format="json").json()["dailyReviewLimit"] == 20
        assert api.patch("/api/settings/", {"dailyReviewLimit": 101}, format="json").status_code == 400
        assert api.patch("/api/settings/", {"activeMaterialsLimit": 0}, format="json").status_code == 400


class TestVacations:
    def test_create_overlap_and_finish(self, api):
        first = api.post("/api/vacations/", {"start": "2030-01-10", "end": "2030-01-15"}, format="json")
        assert first.status_code == 201
        overlap = api.post("/api/vacations/", {"start": "2030-01-14", "end": "2030-01-20"}, format="json")
        assert overlap.status_code == 400
        assert overlap.json()["detail"] == "На эти дни уже есть отпуск."
        open_future = api.post("/api/vacations/", {"start": "2030-02-01", "end": None}, format="json")
        assert "начинается сегодня" in open_future.json()["detail"]
        # Правка не спорит сама с собой.
        vacation = first.json()
        assert api.patch(f"/api/vacations/{vacation['id']}/", {"start": "2030-01-10", "end": "2030-01-12"}, format="json").status_code == 200
        assert api.delete(f"/api/vacations/{vacation['id']}/").status_code == 204


def test_put_is_not_allowed(api, user):
    area = Area.objects.filter(user=user).first()
    assert api.put(f"/api/areas/{area.id}/", {"name": "Х", "color": "clay", "icon": "book"}, format="json").status_code == 405


def test_schema_is_served(api):
    response = api.get("/api/schema/")
    assert response.status_code == 200

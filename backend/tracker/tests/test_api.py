"""CRUD, проверки и изоляция пользователей для сфер, целей, записей, знаний, настроек и отпусков."""

import uuid

import pytest

from tracker.models import Area, Material, Note, ProgressEntry, Review, Task

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

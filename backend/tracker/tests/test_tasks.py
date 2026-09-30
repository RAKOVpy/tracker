"""Задачи и проекты: закрытие, повторы, вехи, части — те же правила, что applyTaskUpdate на фронтенде."""

from datetime import date, datetime
from unittest import mock
from zoneinfo import ZoneInfo

import pytest

from tracker.models import Task

pytestmark = pytest.mark.django_db

WEEKLY = {"unit": "week", "interval": 1, "weekdays": [6], "start": "2026-10-11"}


def task_body(**fields):
    return {"title": "Разбор недели", "notes": "", "status": "todo", "important": False, "checklist": [], **fields}


@pytest.fixture
def fixed_today():
    """«Сегодня» — воскресенье, 11 октября 2026, в любом часовом поясе."""
    moment = datetime(2026, 10, 11, 12, 0, tzinfo=ZoneInfo("UTC"))
    with mock.patch("tracker.today.today_in", lambda tz: moment.astimezone(tz).date()):
        yield date(2026, 10, 11)


def create(api, **fields) -> dict:
    response = api.post("/api/tasks/", task_body(**fields), format="json")
    assert response.status_code == 201, response.json()
    return response.json()


class TestTaskFields:
    def test_shape_matches_frontend(self, api):
        task = create(api, plannedDate="2026-10-11")
        assert set(task) == {
            "id", "title", "notes", "status", "important", "deadline", "plannedDate", "areaId", "projectId", "milestoneId",
            "materialId", "partId", "checklist", "recurrence", "repeatOf", "completedAt", "createdAt",
        }
        assert task["completedAt"] is None and task["repeatOf"] is None

    def test_completed_at_follows_status(self, api):
        task = create(api)
        done = api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json").json()
        assert done["completedAt"]
        # Отменённая из сделанной — время не сбрасывается: задача всё ещё закрыта.
        assert api.patch(f"/api/tasks/{task['id']}/", {"status": "cancelled"}, format="json").json()["completedAt"] == done["completedAt"]
        assert api.patch(f"/api/tasks/{task['id']}/", {"status": "todo"}, format="json").json()["completedAt"] is None
        assert create(api, status="done")["completedAt"]

    def test_checklist_validation(self, api):
        ok = create(api, checklist=[{"id": "c1", "text": "Шаг", "done": False, "extra": 1}])
        assert ok["checklist"] == [{"id": "c1", "text": "Шаг", "done": False}]
        for bad in ([{"id": "c1", "text": "", "done": False}], [{"id": "c1", "text": "А", "done": "yes"}], "x",
                    [{"id": "c1", "text": "А", "done": False}, {"id": "c1", "text": "Б", "done": False}]):
            assert api.post("/api/tasks/", task_body(checklist=bad), format="json").status_code == 400

    def test_recurrence_validation(self, api):
        task = create(api, recurrence={"unit": "week", "interval": 2, "weekdays": [3, 0], "start": "2026-10-05"})
        assert task["recurrence"] == {"unit": "week", "interval": 2, "weekdays": [0, 3], "start": "2026-10-05"}
        bad = api.post("/api/tasks/", task_body(recurrence={"unit": "week", "interval": 1, "weekdays": [], "start": "2026-10-05"}), format="json")
        assert "не выбраны дни" in bad.json()["detail"]


class TestProjectsAndMilestones:
    def make_project(self, api) -> dict:
        body = {"title": "IELTS", "description": "", "areaId": None, "goalId": None, "status": "active", "deadline": None,
                "milestones": [{"title": "Диагностика", "deadline": "2026-10-20"}, {"title": "Writing"}]}
        project = api.post("/api/projects/", body, format="json")
        assert project.status_code == 201, project.json()
        return project.json()

    def test_milestones_and_completed_at(self, api):
        project = self.make_project(api)
        assert [(m["title"], m["deadline"]) for m in project["milestones"]] == [("Диагностика", "2026-10-20"), ("Writing", None)]
        done = api.patch(f"/api/projects/{project['id']}/", {"status": "done"}, format="json").json()
        assert done["completedAt"]
        assert api.patch(f"/api/projects/{project['id']}/", {"status": "paused"}, format="json").json()["completedAt"] is None

    def test_milestone_must_belong_to_project(self, api):
        a, b = self.make_project(api), self.make_project(api)
        bad = api.post("/api/tasks/", task_body(projectId=a["id"], milestoneId=b["milestones"][0]["id"]), format="json")
        assert bad.json()["detail"] == "Веха не из проекта задачи."
        # Без проекта веха снимается.
        loose = create(api, milestoneId=a["milestones"][0]["id"])
        assert loose["milestoneId"] is None

    def test_moving_task_drops_old_milestone(self, api):
        a, b = self.make_project(api), self.make_project(api)
        task = create(api, projectId=a["id"], milestoneId=a["milestones"][0]["id"])
        moved = api.patch(f"/api/tasks/{task['id']}/", {"projectId": b["id"]}, format="json").json()
        assert moved["projectId"] == b["id"] and moved["milestoneId"] is None
        with_new = api.patch(f"/api/tasks/{task['id']}/", {"projectId": a["id"], "milestoneId": a["milestones"][1]["id"]}, format="json").json()
        assert with_new["milestoneId"] == a["milestones"][1]["id"]
        # Правка других полей веху не трогает.
        assert api.patch(f"/api/tasks/{task['id']}/", {"title": "Новое"}, format="json").json()["milestoneId"] == a["milestones"][1]["id"]

    def test_removed_milestone_and_deleted_project_detach_tasks(self, api):
        project = self.make_project(api)
        first, second = project["milestones"]
        task = create(api, projectId=project["id"], milestoneId=first["id"])
        api.patch(f"/api/projects/{project['id']}/", {"milestones": [second]}, format="json")
        assert api.get(f"/api/tasks/{task['id']}/").json()["milestoneId"] is None
        api.delete(f"/api/projects/{project['id']}/")
        detached = api.get(f"/api/tasks/{task['id']}/").json()
        assert detached["projectId"] is None and detached["milestoneId"] is None

    def test_part_must_belong_to_material(self, api):
        m1 = api.post("/api/materials/", {"title": "А", "type": "book", "status": "active", "parts": [{"title": "1"}]}, format="json").json()
        m2 = api.post("/api/materials/", {"title": "Б", "type": "book", "status": "active", "parts": [{"title": "1"}]}, format="json").json()
        bad = api.post("/api/tasks/", task_body(materialId=m1["id"], partId=m2["parts"][0]["id"]), format="json")
        assert bad.json()["detail"] == "Часть не из материала задачи."
        task = create(api, materialId=m1["id"], partId=m1["parts"][0]["id"])
        moved = api.patch(f"/api/tasks/{task['id']}/", {"materialId": m2["id"]}, format="json").json()
        assert moved["partId"] is None


class TestRepeats:
    def test_done_creates_next(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-11", recurrence=WEEKLY, checklist=[{"id": "c", "text": "Входящие", "done": True}])
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        tasks = api.get("/api/tasks/").json()
        assert len(tasks) == 2
        nxt = next(t for t in tasks if t["id"] != task["id"])
        assert nxt["status"] == "todo" and nxt["plannedDate"] == "2026-10-18" and nxt["repeatOf"] == task["id"]
        assert nxt["checklist"] == [{"id": "c", "text": "Входящие", "done": False}]
        assert nxt["recurrence"] == WEEKLY

    def test_skip_creates_next_and_one_off_does_not(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-11", recurrence=WEEKLY)
        api.patch(f"/api/tasks/{task['id']}/", {"status": "cancelled"}, format="json")
        assert Task.objects.count() == 2
        one_off = create(api, plannedDate="2026-10-11")
        api.patch(f"/api/tasks/{one_off['id']}/", {"status": "done"}, format="json")
        assert Task.objects.count() == 3

    def test_undo_removes_untouched_next(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-11", recurrence=WEEKLY)
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        reopened = api.patch(f"/api/tasks/{task['id']}/", {"status": "todo"}, format="json").json()
        assert Task.objects.count() == 1
        assert reopened["recurrence"] == WEEKLY and reopened["completedAt"] is None
        # Снова сделали — снова ровно один следующий повтор.
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        assert Task.objects.count() == 2

    def test_undo_keeps_touched_next_and_makes_task_one_off(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-11", recurrence=WEEKLY)
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        nxt = Task.objects.get(repeat_of_id=task["id"])
        api.patch(f"/api/tasks/{nxt.id}/", {"notes": "Добавил мысль"}, format="json")
        reopened = api.patch(f"/api/tasks/{task['id']}/", {"status": "todo"}, format="json").json()
        assert Task.objects.count() == 2
        assert reopened["recurrence"] is None

    def test_late_daily_task_gives_one_next(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-01", recurrence={"unit": "day", "interval": 1, "weekdays": [], "start": "2026-10-01"})
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        assert Task.objects.get(repeat_of_id=task["id"]).planned_date == date(2026, 10, 12)

    def test_today_uses_client_timezone(self, api):
        """В 23:30 по Москве 11 октября — это уже 12-е в Токио: следующий ежедневный повтор — 13-е."""
        moment = datetime(2026, 10, 11, 20, 30, tzinfo=ZoneInfo("UTC"))
        daily = {"unit": "day", "interval": 1, "weekdays": [], "start": "2026-10-01"}
        with mock.patch("tracker.today.today_in", lambda tz: moment.astimezone(tz).date()):
            moscow = create(api, plannedDate="2026-10-01", recurrence=daily)
            api.patch(f"/api/tasks/{moscow['id']}/", {"status": "done"}, format="json", HTTP_X_TIMEZONE="Europe/Moscow")
            tokyo = create(api, plannedDate="2026-10-01", recurrence=daily)
            api.patch(f"/api/tasks/{tokyo['id']}/", {"status": "done"}, format="json", HTTP_X_TIMEZONE="Asia/Tokyo")
        assert Task.objects.get(repeat_of_id=moscow["id"]).planned_date == date(2026, 10, 12)
        assert Task.objects.get(repeat_of_id=tokyo["id"]).planned_date == date(2026, 10, 13)

    def test_deleting_task_keeps_next_without_link(self, api, fixed_today):
        task = create(api, plannedDate="2026-10-11", recurrence=WEEKLY)
        api.patch(f"/api/tasks/{task['id']}/", {"status": "done"}, format="json")
        api.delete(f"/api/tasks/{task['id']}/")
        assert Task.objects.get().repeat_of is None

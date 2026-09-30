"""
Данные демо-аккаунта: трекер, который ведут около четырёх месяцев. Результат — резервная копия
в формате backup.py, её загружает import_data, так что проверки те же, что у обычной загрузки.

Все даты считаются от «сегодня», поэтому демо, пересозданное в любой день, выглядит свежим:
на сегодня есть задачи, повторения и привычки, у привычек — серии, у целей — отставание или запас.
Случайность (пропуски, минуты, страницы) — с постоянным зерном: одинаковая дата даёт одинаковые данные.

Заметки и материалы из Obsidian берутся из vault.json — разбора obsidian/example-vault парсером
фронтенда (см. obsidian/parse.test.ts). Поэтому первая синхронизация с этим хранилищем ничего
не меняет у старых заметок и добавляет только три новые, написанные «после неё».
"""

import json
import random
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from urllib.parse import quote

from ..backup import SCHEMA_VERSION
from ..defaults import DEFAULT_SETTINGS
from ..rules.dates import add_days, add_months, week_start
from ..rules.recurrence import first_occurrence, next_occurrence, parse_rule
from .content import TRACKER_NOTES, WEEKLY_REVIEWS

VAULT_MANIFEST = Path(__file__).with_name("vault.json")

AREAS = [
    ("Учёба", "clay", "study"),
    ("Языки", "slate", "languages"),
    ("Чтение", "ochre", "book"),
    ("Спорт", "sage", "dumbbell"),
    ("Здоровье", "rose", "health"),
    ("Работа", "teal", "work"),
]

# Заметки из хранилища, которые уже есть в трекере: путь, сколько дней назад добавлена, оценки повторений
# по порядку («good+yes» — оценка и ответ на «смог бы объяснить?», «!» — объяснил кому-то) и сколько дней
# заметка ждёт повторения (0 — с сегодня, None — срок сам собой в будущем). Когда оценки кончаются, дальше — «good».
# Алгоритм Дейкстры, пассивный залог и жадные алгоритмы в трекер ещё не попали: их добавит первая синхронизация.
VAULT_NOTES = [
    ("Заметки/Present Perfect и Past Simple.md", 104, ["good", "good", "good+hints", "easy+yes", "good+yes"], None),
    ("Заметки/Четыре закона изменения поведения.md", 100, ["good", "good", "good+yes", "good+yes"], None),
    ("Заметки/Сложность алгоритмов и O-большое.md", 98, ["good", "hard", "good", "good+hints", "good+yes"], None),
    ("Заметки/Правило двух минут.md", 96, ["good", "easy", "good+yes", "good+yes!"], None),
    ("Заметки/Цепочка привычек.md", 92, ["good", "good", "hard", "good+hints", "good+yes"], None),
    ("Заметки/Двоичный поиск.md", 90, ["good", "good", "again", "good", "good", "good+hints"], None),
    ("Заметки/Сортировка слиянием.md", 88, ["good", "good", "good", "hard", "good"], None),
    ("Заметки/Привычка как голос за идентичность.md", 86, ["good", "good+hints", "good+yes", "easy+yes"], None),
    ("Заметки/Модальные глаголы can, could, be able to.md", 85, ["hard", "good", "good", "again", "good", "good"], None),
    ("Заметки/Быстрая сортировка.md", 80, ["good", "hard", "good", "good"], None),
    ("Заметки/Хеш-таблицы и коллизии.md", 66, ["good", "good", "hard", "good"], 2),
    ("Заметки/First и second conditional.md", 60, ["hard", "good", "again", "good"], 0),
    ("Заметки/Обход графа в ширину и в глубину.md", 25, ["good", "good", "good+hints"], 0),
    ("Заметки/Артикли a, an и the.md", 20, ["good", "hard", "good"], 0),
    ("Заметки/Система 1 и Система 2.md", 18, ["good", "good"], 0),
    ("Заметки/Эвристика доступности.md", 10, ["good", "good"], None),
    ("Заметки/Эффект якоря.md", 5, ["hard"], 1),
]

# Заметки из трекера: ключ в content.TRACKER_NOTES, сколько дней назад добавлена, оценки, сколько дней ждёт
# повторения, приостановлена ли.
TRACKER_NOTE_PLAN = [
    ("forgetting", 95, ["good", "good", "hard"], None, True),
    ("feynman", 70, ["good", "good", "good+hints", "good+yes"], None, False),
    ("tls", 50, ["good", "hard", "good"], 0, False),
]

# Интервалы и правила оценок — как domain/review.ts на фронтенде.
INTERVALS = [1, 3, 7, 16, 35, 90, 180]


def new_id() -> str:
    return str(uuid.uuid4())


def obsidian_uri(vault: str, path: str) -> str:
    """Как obsidianUri на фронтенде: encodeURIComponent не трогает !~*'()."""
    file = path[:-3] if path.lower().endswith(".md") else path
    encode = lambda text: quote(text, safe="!~*'()")  # noqa: E731
    return f"obsidian://open?vault={encode(vault)}&file={encode(file)}"


def schedule(step: int, rating: str) -> tuple[int, int]:
    """Следующий интервал и ступень по оценке (schedule в domain/review.ts)."""
    clamp = lambda i: min(max(i, 0), len(INTERVALS) - 1)  # noqa: E731
    if rating == "again":
        return INTERVALS[0], step // 2
    if rating == "hard":
        return INTERVALS[clamp(step - 1)], step
    if rating == "good":
        return INTERVALS[clamp(step)], step + 1
    return INTERVALS[clamp(step + 1)], step + 2


def shift_for_vacations(anchor: date, due: date, vacations: list[tuple[date, date]], today: date) -> date:
    """Срок повторения, сдвинутый на дни отпуска (shiftForVacations в domain/vacation.ts; отпуска с датой конца)."""
    result = due
    for start, end in sorted(vacations):
        after_due = start > result
        if after_due and start > today:
            break
        last = today if after_due and end > today else end
        first = start if start > anchor else add_days(anchor, 1)
        if last < first:
            continue
        result = add_days(result, (last - first).days + 1)
    return result


class DemoBuilder:
    def __init__(self, today: date, vault_name: str | None = None, seed: int = 2026):
        self.today = today
        self.monday = week_start(today)
        self.seed = seed
        self.rng = random.Random(seed)
        manifest = json.loads(VAULT_MANIFEST.read_text("utf-8"))
        self.vault_notes = {note["path"]: note for note in manifest["notes"]}
        self.vault_materials = manifest["materials"]
        self.vault_name = vault_name or manifest["vaultName"]
        # Отпуск полтора месяца назад: с субботы по воскресенье следующей недели. И ещё один — запланирован.
        self.vacation = (self.week(-7, 5), self.week(-6, 6))
        self.planned_vacation = (self.week(6, 4), self.week(7, 6))
        self.vacations = [self.vacation, self.planned_vacation]
        self.data: dict = {
            "app": "tracker",
            "version": SCHEMA_VERSION,
            "exported_at": self.at(today, 0),
            "settings": dict(DEFAULT_SETTINGS),
            **{
                key: []
                for key in (
                    "areas",
                    "goals",
                    "entries",
                    "materials",
                    "notes",
                    "reviews",
                    "vacations",
                    "tasks",
                    "projects",
                    "weekly_reviews",
                )
            },
        }
        self.area: dict[str, str] = {}

    # ---------- даты ----------

    def day(self, offset: int) -> date:
        return add_days(self.today, offset)

    def week(self, weeks: int, weekday: int = 0) -> date:
        """День недели (0 — пн) недели, отстоящей на weeks от текущей."""
        return add_days(self.monday, 7 * weeks + weekday)

    def at(self, d: date, hour: int, minute: int = 0) -> str:
        """Момент в часовом поясе компьютера. Сегодняшний — не позже, чем сейчас."""
        moment = datetime.combine(d, time(hour, minute)).astimezone()
        now = datetime.now().astimezone()
        if d == date.today() and moment > now:
            moment = now - timedelta(minutes=5)
        return moment.isoformat()

    def on_vacation(self, d: date) -> bool:
        return any(start <= d <= end for start, end in self.vacations)

    def days(self, first: date, last: date):
        """Дни с first по last включительно, кроме отпуска."""
        d = first
        while d <= last:
            if not self.on_vacation(d):
                yield d
            d = add_days(d, 1)

    # ---------- объекты ----------

    def add_area(self, name: str, color: str, icon: str, order: int) -> None:
        area_id = new_id()
        self.area[name] = area_id
        self.data["areas"].append(
            {"id": area_id, "name": name, "color": color, "icon": icon, "order": order, "created_at": self.at(self.day(-112), 20)}
        )

    def goal(self, title: str, area: str | None, unit: str, value: float, start: date, **fields) -> str:
        goal_id = new_id()
        kind = fields.get("kind", "target")
        self.data["goals"].append(
            {
                "id": goal_id,
                "kind": kind,
                "title": title,
                "description": fields.get("description", ""),
                "area_id": self.area.get(area),
                "unit": unit,
                "target_value": value,
                "start_date": start.isoformat(),
                "deadline": fields["deadline"].isoformat() if kind == "target" else None,
                "days_per_week": fields.get("days_per_week") if kind == "habit" else None,
                "priority": fields.get("priority", "medium"),
                "status": fields.get("status", "active"),
                "created_at": self.at(min(start, self.today), 9, 12),
            }
        )
        return goal_id

    def entry(self, goal_id: str, d: date, value: float, note: str = "", hour: int = 21) -> None:
        self.data["entries"].append(
            {
                "id": new_id(),
                "goal_id": goal_id,
                "date": d.isoformat(),
                "value": value,
                "note": note,
                "created_at": self.at(d, hour, self.rng.randrange(60)),
            }
        )

    def material(self, title: str, type_: str, area: str | None, status: str, created: date, **fields) -> dict:
        material = {
            "id": new_id(),
            "title": title,
            "type": type_,
            "author": fields.get("author", ""),
            "url": fields.get("url", ""),
            "area_id": self.area.get(area),
            "status": status,
            "obsidian_path": fields.get("obsidian_path"),
            "parts": [{"id": new_id(), "title": part, "status": part_status} for part, part_status in fields.get("parts", [])],
            "created_at": self.at(created, 20, 30),
        }
        self.data["materials"].append(material)
        return material

    def task(self, title: str, **fields) -> str:
        status = fields.get("status", "todo")
        planned, deadline = fields.get("planned"), fields.get("deadline")
        done_on = fields.get("done_on")
        closed = status in ("done", "cancelled")
        if closed and done_on is None:
            raise ValueError(f"У закрытой задачи нужна дата: {title}")
        created = fields.get("created") or min(d for d in (planned, deadline, done_on, self.today) if d is not None) - timedelta(days=2)
        created = min(max(created, self.day(-112)), self.today)
        task_id = new_id()
        hour, minute = fields.get("done_time", (19, 30))
        self.data["tasks"].append(
            {
                "id": task_id,
                "title": title,
                "notes": fields.get("notes", ""),
                "status": status,
                "important": fields.get("important", False),
                "deadline": deadline.isoformat() if deadline else None,
                "planned_date": planned.isoformat() if planned else None,
                "area_id": self.area.get(fields.get("area")),
                "project_id": fields.get("project"),
                "milestone_id": fields.get("milestone"),
                "material_id": fields.get("material"),
                "part_id": fields.get("part"),
                "checklist": [{"id": new_id(), "text": text, "done": done} for text, done in fields.get("checklist", [])],
                "recurrence": fields.get("recurrence"),
                "repeat_of": fields.get("repeat_of"),
                "completed_at": self.at(done_on, hour, minute) if closed else None,
                "created_at": self.at(created, 12, 5),
            }
        )
        return task_id

    def recurring(self, title: str, rule: dict, *, by_deadline: bool = False, **fields) -> None:
        """
        Повторяющаяся задача с историей, как при отметках в трекере: открыт один повтор — ближайший
        с сегодняшнего дня, прошедшие закрыты, и каждый следующий появился, когда закрыли предыдущий.
        Задача «к сроку» (by_deadline) закрыта накануне срока, до отпуска — если срок попал на отпуск;
        задача «на день» закрыта в свой день, а в отпуске пропущена.
        """
        parsed = parse_rule(rule)
        occurrence = first_occurrence(parsed, parsed.start)
        previous, closed_on = None, add_days(parsed.start, -1)
        while True:
            done_on = add_days(occurrence, -1) if by_deadline else occurrence
            while by_deadline and self.on_vacation(done_on):
                done_on = add_days(done_on, -1)
            if done_on >= self.today:
                break
            status = "cancelled" if self.on_vacation(done_on) else "done"
            dates = {"deadline": occurrence} if by_deadline else {"planned": occurrence}
            previous = self.task(
                title, status=status, done_on=done_on, recurrence=rule, repeat_of=previous, created=closed_on, **dates, **fields
            )
            closed_on = done_on
            occurrence = next_occurrence(parsed, occurrence)
        dates = {"deadline": occurrence} if by_deadline else {"planned": occurrence}
        self.task(title, recurrence=rule, repeat_of=previous, created=closed_on, **dates, **fields)

    def project(self, title: str, area: str | None, created: date, milestones: list[tuple[str, date | None]], **fields):
        project_id = new_id()
        items = [{"id": new_id(), "title": name, "deadline": deadline.isoformat() if deadline else None} for name, deadline in milestones]
        completed = fields.get("completed")
        self.data["projects"].append(
            {
                "id": project_id,
                "title": title,
                "description": fields.get("description", ""),
                "area_id": self.area.get(area),
                "goal_id": fields.get("goal"),
                "status": fields.get("status", "active"),
                "deadline": fields["deadline"].isoformat() if fields.get("deadline") else None,
                "milestones": items,
                "completed_at": self.at(completed, 18) if completed else None,
                "created_at": self.at(created, 10),
            }
        )
        return project_id, [item["id"] for item in items]

    def history(self, title: str, added: date, plan: list[str], last_day: date) -> tuple[list[dict], date]:
        """
        Журнал повторений: повторяем в срок, иногда на день-два позже, в отпуске — никогда.
        Возвращает повторения и срок следующего. Случайность своя у каждой заметки.
        """
        rng = random.Random(f"{self.seed}:{title}")
        reviews: list[dict] = []
        step, anchor, interval = 0, added, 1
        for index in range(100):
            due = shift_for_vacations(anchor, add_days(anchor, interval), self.vacations, self.today)
            reviewed = add_days(due, rng.choice([0, 0, 0, 0, 0, 1, 1, 2]))
            while self.on_vacation(reviewed):
                reviewed = add_days(reviewed, 1)
            if reviewed > last_day:
                return reviews, due
            code = plan[index] if index < len(plan) else "good"
            rating, _, explain = code.partition("+")
            interval, step = schedule(step, rating)
            anchor = reviewed
            reviews.append(
                {
                    "id": new_id(),
                    "date": reviewed.isoformat(),
                    "rating": rating,
                    "explain": explain.rstrip("!") or None,
                    "taught": explain.endswith("!"),
                    "created_at": self.at(reviewed, 8, 20 + index % 30),
                }
            )
        return reviews, due

    def note(self, title: str, added: date, plan: list[str], *, due: date | None = None, stop: date | None = None, **fields) -> None:
        """
        Заметка с журналом повторений. due — когда заметка должна ждать повторения (сегодня или раньше):
        тогда дата добавления подбирается рядом с added так, чтобы расписание пришло ровно к этому дню.
        stop — с этого дня заметка на паузе.
        """
        last_day = stop or add_days(self.today, -1)
        if due is not None:
            last_day = min(last_day, add_days(due, -1))
        reviews, next_due = self.history(title, added, plan, last_day)
        if due is not None:
            for shift in sorted(range(-45, 46), key=abs):
                start = add_days(added, shift)
                if start < self.day(-112) or start >= due:
                    continue
                reviews, next_due = self.history(title, start, plan, last_day)
                if next_due == due:
                    added = start
                    break
        note_id = new_id()
        self.data["notes"].append(
            {
                "id": note_id,
                "title": title,
                "material_id": fields.get("material"),
                "questions": fields["questions"],
                "summary": fields.get("summary", ""),
                "obsidian_uri": fields.get("obsidian_uri", ""),
                "status": "paused" if stop else "active",
                "added_on": added.isoformat(),
                "obsidian_path": fields.get("obsidian_path"),
                "created_at": self.at(added, 21, 10),
            }
        )
        self.data["reviews"].extend({**review, "note_id": note_id} for review in reviews)

    # ---------- сборка ----------

    def build(self) -> dict:
        for order, (name, color, icon) in enumerate(AREAS):
            self.add_area(name, color, icon, order)
        for start, end in self.vacations:
            self.data["vacations"].append(
                {
                    "id": new_id(),
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "created_at": self.at(min(add_days(start, -20), self.today), 22),
                }
            )
        goals = self.build_goals()
        materials = self.build_knowledge()
        self.build_tasks(goals, materials)
        self.build_weekly_reviews()
        return self.data

    def build_goals(self) -> dict[str, str]:
        rng = self.rng
        yesterday = self.day(-1)
        _, v_end = self.vacation
        goals: dict[str, str] = {}

        # Английские слова: два срыва (в начале и сразу после отпуска), остальные пропуски — поодиночке,
        # их прощает заморозка. Один день — только 10 минут из 20. Сегодня ещё не отмечено.
        start = self.day(-112)
        words = goals["words"] = self.goal(
            "Английские слова",
            "Языки",
            "минут",
            20,
            start,
            kind="habit",
            days_per_week=7,
            description="Карточки в приложении, пока пью утренний кофе.",
        )
        misses = {add_days(start, 8), add_days(start, 9), add_days(start, 23), add_days(start, 37), add_days(start, 51)}
        misses |= {add_days(v_end, 1), add_days(v_end, 2), self.week(-3, 1)}
        partial = self.week(-2, 5)
        for d in self.days(start, yesterday):
            if d in misses:
                continue
            self.entry(words, d, 10 if d == partial else rng.choice([20, 20, 20, 20, 25, 30]), hour=8)

        # Зал 3 раза в неделю: три недели без одного раза (прощены — между ними больше четырёх недель),
        # в неделю перед отпуском норма меньше, в отпуске — ноль.
        gym = goals["gym"] = self.goal(
            "Зал",
            "Спорт",
            "раз",
            1,
            self.week(-16),
            kind="habit",
            days_per_week=3,
            description="Три тренировки в неделю, в любые дни.",
        )
        for weeks in range(-16, 1):
            pattern = rng.choice([(0, 2, 4), (0, 2, 4), (1, 3, 5), (0, 3, 5)])
            if weeks in (-14, -10, -5):
                pattern = pattern[:2]
            for weekday in pattern:
                d = self.week(weeks, weekday)
                if d < self.today and not self.on_vacation(d):
                    self.entry(gym, d, 1, rng.choice(["", "", "", "Ноги", "Спина и грудь", "Плечи", "Кардио 30 минут"]), hour=19)

        # Медитация: срыв две недели назад, серия идёт заново.
        start = self.week(-9)
        meditation = goals["meditation"] = self.goal(
            "Медитация", "Здоровье", "минут", 10, start, kind="habit", days_per_week=7, description="Перед сном, приложение с таймером."
        )
        misses = {self.week(-9, 3), self.week(-7, 2), self.week(-2, 1), self.week(-2, 2)}
        for d in self.days(start, yesterday):
            if d not in misses:
                self.entry(meditation, d, rng.choice([10, 10, 10, 15]), hour=23)

        # Пробежка 2 раза в неделю, по 5 км: во вторник и субботу.
        start = self.week(-8)
        running = goals["running"] = self.goal(
            "Пробежка",
            "Спорт",
            "км",
            5,
            start,
            kind="habit",
            days_per_week=2,
            description="Вместо цели «100 км за месяц»: спокойно, но регулярно.",
        )
        for weeks in range(-8, 1):
            for weekday in (1,) if weeks == -3 else (1, 5):
                d = self.week(weeks, weekday)
                if d < self.today and not self.on_vacation(d):
                    self.entry(running, d, rng.choice([5, 5, 5.5, 6, 7]), hour=8)

        # Привычка, которая не прижилась: в архиве.
        start = self.day(-110)
        phone = self.goal("Без телефона после 23:00", "Здоровье", "раз", 1, start, kind="habit", days_per_week=7, status="archived")
        for d in self.days(start, self.day(-85)):
            if rng.random() < 0.55:
                self.entry(phone, d, 1)

        # Разговорная практика: уроки по вторникам и четвергам (их отмечают задачи), разговорный клуб раз в две недели.
        english = goals["english"] = self.goal(
            "Английский: 60 часов разговорной практики",
            "Языки",
            "часов",
            60,
            self.day(-105),
            deadline=self.day(45),
            priority="high",
            description="Уроки с преподавателем, разговорный клуб и записи себя для IELTS Speaking.",
        )
        for d in self.days(self.day(-105), yesterday):
            if d.weekday() in (1, 3):
                self.entry(english, d, 1, "Урок с преподавателем", hour=20)
            elif d.weekday() == 5 and (d - self.day(-105)).days // 7 % 2 == 0:
                self.entry(english, d, 1.5, "Разговорный клуб", hour=14)

        leetcode = goals["leetcode"] = self.goal(
            "Решить 150 задач на LeetCode",
            "Учёба",
            "задач",
            150,
            self.day(-70),
            deadline=self.day(50),
            description="Easy и Medium, по темам курса.",
        )
        for d in self.days(self.day(-70), yesterday):
            if rng.random() < 0.72:
                self.entry(leetcode, d, rng.choice([1, 2, 2, 3]), hour=22)

        # Книга: чуть отстаёт от плана — трекер предложит норму, чтобы наверстать.
        kahneman = goals["kahneman"] = self.goal(
            "Прочитать «Думай медленно… решай быстро»",
            "Чтение",
            "стр.",
            500,
            self.day(-24),
            deadline=self.day(21),
            description="Перед сном, минимум 10 страниц.",
        )
        for d in self.days(self.day(-24), yesterday):
            if rng.random() < 0.85:
                self.entry(kahneman, d, rng.randrange(7, 17), hour=23)

        # Прочитанная книга: цель достигнута.
        atomic = goals["atomic"] = self.goal(
            "Прочитать «Атомные привычки»", "Чтение", "стр.", 320, self.day(-110), deadline=self.day(-60), priority="high"
        )
        read = 0
        for d in self.days(self.day(-110), yesterday):
            pages = min(320 - read, rng.randrange(6, 14))
            if pages <= 0:
                break
            if rng.random() < 0.9:
                self.entry(atomic, d, pages, hour=23)
                read += pages

        # Слишком резкая цель, от которой отказались в пользу привычки.
        runs = self.goal(
            "Пробежать 100 км за месяц",
            "Спорт",
            "км",
            100,
            self.day(-85),
            deadline=self.day(-55),
            status="archived",
            description="Слишком резко начал — заменил привычкой «Пробежка» 2 раза в неделю.",
        )
        for offset in (-85, -83, -81, -78, -76, -72, -69, -64):
            self.entry(runs, self.day(offset), rng.choice([4, 5, 5, 6]), hour=8)

        # Цель на потом: начнётся после алгоритмов.
        self.goal("SQL: пройти 40 уроков", "Учёба", "уроков", 40, self.day(12), deadline=self.day(72), priority="low")
        return goals

    def build_knowledge(self) -> dict[str, dict]:
        materials: dict[str, dict] = {}
        lectures = [
            "Асимптотика",
            "Поиск и сортировки",
            "Хеш-таблицы",
            "Графы",
            "Кратчайшие пути",
            "Жадные алгоритмы",
            "Динамическое программирование",
            "Деревья поиска",
            "Кучи",
            "Строки",
        ]
        info = {m["title"]: m for m in self.vault_materials}

        def from_vault(title: str, status: str, created: date, parts=()) -> dict:
            m = info[title]
            return self.material(
                title,
                m["type"],
                m["areaName"],
                status,
                created,
                author=m["author"],
                url=m["url"],
                obsidian_path=m["path"],
                parts=parts,
            )

        materials["algorithms"] = from_vault(
            "Алгоритмы и структуры данных",
            "active",
            self.day(-100),
            [(f"Лекция {i + 1}. {name}", "studied" if i < 6 else "todo") for i, name in enumerate(lectures)],
        )
        materials["grammar"] = from_vault("English Grammar in Use", "active", self.day(-104))
        materials["kahneman"] = from_vault(
            "Думай медленно… решай быстро",
            "active",
            self.day(-24),
            [
                ("Часть 1. Две системы", "studied"),
                ("Часть 2. Эвристики и искажения", "studied"),
                ("Часть 3. Чрезмерная уверенность", "todo"),
                ("Часть 4. Выбор", "todo"),
                ("Часть 5. Два «я»", "todo"),
            ],
        )
        materials["atomic"] = from_vault("Атомные привычки", "done", self.day(-110))
        materials["https"] = self.material("Как работает HTTPS", "article", "Работа", "done", self.day(-52))
        self.material("SQL: основы", "course", "Учёба", "queued", self.day(-30), author="Stepik")
        self.material("Чистый код", "book", "Работа", "queued", self.day(-58), author="Роберт Мартин")
        self.material("Машинное обучение для начинающих", "course", "Учёба", "dropped", self.day(-95))

        by_title = {m["title"]: m["id"] for m in self.data["materials"]}
        waiting = lambda days: None if days is None else self.day(-days)  # noqa: E731
        for path, added, plan, overdue in VAULT_NOTES:
            note = self.vault_notes[path]
            self.note(
                note["title"],
                self.day(-added),
                plan,
                due=waiting(overdue),
                material=by_title.get(note["materialRef"]),
                questions=note["questions"],
                summary=note["summary"],
                obsidian_uri=obsidian_uri(self.vault_name, path),
                obsidian_path=path,
            )
        for key, added, plan, overdue, paused in TRACKER_NOTE_PLAN:
            title, material, questions, summary = TRACKER_NOTES[key]
            self.note(
                title,
                self.day(-added),
                plan,
                due=waiting(overdue),
                stop=self.day(-40) if paused else None,
                material=by_title.get(material),
                questions=questions,
                summary=summary,
            )
        return materials

    def build_tasks(self, goals: dict[str, str], materials: dict[str, dict]) -> None:
        d, w = self.day, self.week

        # --- повторяющиеся ---
        self.recurring(
            "Урок английского",
            {"unit": "week", "interval": 1, "weekdays": [1, 3], "start": d(-105).isoformat()},
            area="Языки",
            notes="Созвон с преподавателем в 19:00. Заранее — список вопросов и новые слова.",
            done_time=(20, 5),
        )
        self.recurring("Уборка", {"unit": "week", "interval": 1, "weekdays": [5], "start": d(-110).isoformat()}, done_time=(12, 40))
        self.recurring(
            "Позвонить родителям", {"unit": "week", "interval": 1, "weekdays": [6], "start": d(-110).isoformat()}, done_time=(18, 15)
        )
        self.recurring("Полить цветы", {"unit": "day", "interval": 4, "weekdays": [], "start": d(-109).isoformat()}, done_time=(9, 10))
        self.recurring(
            "Оплатить интернет",
            {"unit": "month", "interval": 1, "weekdays": [], "start": add_months(d(3), -4).isoformat()},
            by_deadline=True,
            done_time=(21, 0),
        )

        # --- проекты ---
        ielts, (diagnostics, writing, speaking, exam) = self.project(
            "Подготовиться к IELTS",
            "Языки",
            d(-95),
            [("Диагностика", None), ("Writing", d(12)), ("Speaking", d(30)), ("Экзамен", d(40))],
            goal=goals["english"],
            deadline=d(40),
            description="Нужно 7.0: для магистратуры. Слабее всего Writing Task 2.",
        )
        inl = {"project": ielts, "area": "Языки"}
        self.task("Пройти пробный тест", status="done", done_on=d(-92), milestone=diagnostics, **inl)
        self.task("Разобрать ошибки пробного теста", status="done", done_on=d(-89), milestone=diagnostics, **inl)
        self.task("Записаться на экзамен", status="done", done_on=w(-5, 2), milestone=exam, important=True, **inl)
        self.task("Эссе Task 2: образование", status="done", done_on=d(-19), milestone=writing, **inl)
        self.task("Эссе Task 2: здоровье", status="done", done_on=w(-2, 3), milestone=writing, **inl)
        self.task(
            "Эссе Task 2: технологии",
            planned=d(1),
            milestone=writing,
            checklist=[("План на 4 абзаца", True), ("Написать за 40 минут", False), ("Проверить по критериям", False)],
            **inl,
        )
        self.task("Выучить 20 связок для эссе", milestone=writing, **inl)
        self.task("Speaking: записать ответ на Part 2", planned=d(3), milestone=speaking, **inl)
        self.task("Speaking: пробное интервью с преподавателем", planned=d(9), milestone=speaking, **inl)

        seminar, (material_ms, slides, rehearsal) = self.project(
            "Выступить на семинаре по алгоритмам",
            "Учёба",
            d(-16),
            [("Материал", d(1)), ("Слайды", d(4)), ("Репетиция", d(5))],
            deadline=d(6),
            description="Доклад про кратчайшие пути: 10 минут и вопросы.",
        )
        ins = {"project": seminar, "area": "Учёба"}
        self.task("Выбрать тему доклада", status="done", done_on=w(-3, 2), milestone=material_ms, **ins)
        self.task("Пересмотреть лекцию про кратчайшие пути", status="done", done_on=d(-3), milestone=material_ms, **ins)
        self.task(
            "Собрать материал про кратчайшие пути",
            planned=d(0),
            deadline=d(1),
            important=True,
            milestone=material_ms,
            checklist=[("Выписать псевдокод Дейкстры", True), ("Пример с картой метро", False), ("Когда нужен Беллман — Форд", False)],
            **ins,
        )
        self.task(
            "Сделать слайды",
            planned=d(2),
            deadline=d(4),
            important=True,
            milestone=slides,
            notes="8–10 слайдов, один пример на весь доклад.",
            **ins,
        )
        self.task("Прогнать выступление перед другом", planned=d(5), milestone=rehearsal, **ins)

        portfolio, (design, layout, launch) = self.project(
            "Сайт-портфолио",
            "Работа",
            d(-100),
            [("Проекты", None), ("Вёрстка", None), ("Запуск", None)],
            status="done",
            completed=w(-8, 3),
        )
        inp = {"project": portfolio, "area": "Работа"}
        self.task("Собрать 5 лучших проектов", status="done", done_on=w(-12, 2), milestone=design, **inp)
        self.task("Написать по абзацу о каждом", status="done", done_on=w(-12, 5), milestone=design, **inp)
        self.task("Сверстать главную", status="done", done_on=w(-10, 1), milestone=layout, **inp)
        self.task("Сверстать страницы проектов", status="done", done_on=w(-9, 3), milestone=layout, **inp)
        self.task("Купить домен", status="done", done_on=w(-9, 5), milestone=launch, **inp)
        self.task("Выложить на хостинг", status="done", done_on=w(-8, 3), milestone=launch, **inp)

        coursework, (topic, _chapters) = self.project(
            "Курсовая по базам данных",
            "Учёба",
            w(-4, 2),
            [("Тема и план", None), ("Главы", d(50))],
            deadline=d(55),
            description="Индексы в PostgreSQL: когда помогают и когда мешают.",
        )
        self.task("Выбрать тему курсовой", status="done", done_on=w(-3, 4), project=coursework, milestone=topic, area="Учёба")
        self.task("Согласовать тему с научником", status="done", done_on=w(-1, 3), project=coursework, milestone=topic, area="Учёба")

        race, (base, pace) = self.project(
            "Забег на 10 км",
            "Спорт",
            w(-8, 0),
            [("База: 5 км без остановки", None), ("Темп: 10 км за час", d(38))],
            goal=goals["running"],
            deadline=d(40),
        )
        self.task("Купить беговые кроссовки", status="done", done_on=w(-8, 0), project=race, milestone=base, area="Спорт")
        self.task("Пробежать 5 км без остановки", status="done", done_on=w(-4, 5), project=race, milestone=base, area="Спорт")
        self.task("Зарегистрироваться на забег", planned=d(1), deadline=d(7), important=True, project=race, milestone=pace, area="Спорт")
        self.task("Составить план интервальных тренировок", project=race, milestone=pace, area="Спорт")

        moving, _ = self.project("Переезд", None, d(-75), [], status="paused", description="Отложил до лета.")
        self.task("Посмотреть три квартиры", status="done", done_on=d(-68), project=moving)
        self.task("Найти грузчиков", project=moving)
        self.task("Разобрать шкаф", project=moving)

        # --- конспекты частей ---
        algo, kahn = materials["algorithms"], materials["kahneman"]
        for index, done_on in enumerate([d(-96), d(-84), d(-65), w(-4, 2), w(-1, 5)]):
            part = algo["parts"][index]
            self.task(
                f"Законспектировать: {part['title']}", status="done", done_on=done_on, material=algo["id"], part=part["id"], area="Учёба"
            )
        part = algo["parts"][5]
        self.task(f"Законспектировать: {part['title']}", planned=d(0), deadline=d(2), material=algo["id"], part=part["id"], area="Учёба")
        part = kahn["parts"][0]
        self.task(f"Законспектировать: {part['title']}", status="done", done_on=d(-17), material=kahn["id"], part=part["id"], area="Чтение")
        part = kahn["parts"][1]
        self.task(f"Законспектировать: {part['title']}", planned=d(3), material=kahn["id"], part=part["id"], area="Чтение")

        # --- разовые: сегодня, просроченное, на неделе, без даты, входящие ---
        self.task("Ответить на письмо куратора", planned=d(-1), area="Учёба")
        self.task("Сдать отчёт по практике", deadline=d(-1), important=True, area="Работа", notes="Шаблон в почте от куратора.")
        self.task("Купить подарок сестре", planned=d(0))
        self.task("Записаться к стоматологу", status="done", planned=d(0), done_on=d(0), done_time=(10, 15), area="Здоровье")
        self.task("Купить билеты домой на праздники", deadline=d(12), important=True)
        self.task("Пройти ТО машины", planned=d(6))
        self.task("Обновить резюме", area="Работа", notes="Добавить ссылку на портфолио.")
        self.task("Разобрать фотографии с отпуска")
        for title, offset in [
            ("Посмотреть доклад про CRDT", -6),
            ("Разобраться с налоговым вычетом за учёбу", -4),
            ("Идея: телеграм-бот для напоминаний", -3),
            ("Подарок на новоселье друзьям", -1),
            ("Курс по SQL — начать после алгоритмов?", 0),
        ]:
            self.task(title, status="inbox", created=d(offset))
        self.task("Купить абонемент в бассейн", status="cancelled", done_on=d(-50), area="Спорт")
        for title, done_on, area in [
            ("Продлить страховку", d(-80), None),
            ("Сдать книги в библиотеку", d(-66), "Чтение"),
            ("Поменять резину", d(-30), None),
            ("Купить подарок маме", d(-27), None),
            ("Оплатить учёбу", d(-15), "Учёба"),
            ("Выгрузить резервную копию трекера", d(-9), None),
        ]:
            self.task(title, status="done", done_on=done_on, area=area)

    def build_weekly_reviews(self) -> None:
        for weeks_ago, focus, reflection in WEEKLY_REVIEWS:
            self.data["weekly_reviews"].append(
                {
                    "id": new_id(),
                    "week_start": self.week(-weeks_ago).isoformat(),
                    # Фокус прошлого обзора — на эту неделю: в понедельник утром ещё ничего не отмечено.
                    "focus": [
                        {"id": new_id(), "text": text, "done": done and (weeks_ago > 1 or self.today > self.monday)} for text, done in focus
                    ],
                    "reflection": reflection,
                    "created_at": self.at(self.week(-weeks_ago, 6), 19, 40),
                }
            )


def build_demo(today: date, vault_name: str | None = None) -> dict:
    return DemoBuilder(today, vault_name).build()

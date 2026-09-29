# Трекер целей: архитектура и план

## Идея

Долгосрочные цели теряются в суете дня. Приложение превращает цель со сроком
(«прочитать 480 страниц к 19 октября») в **конкретную норму на сегодня**
(«сегодня: 18 стр.») и показывает, идёшь ли ты по плану.

Главный экран отвечает на один вопрос: **что мне нужно сделать сегодня, чтобы не отстать?**

## Этапы

| Этап | Что появляется | Статус |
|------|----------------|--------|
| **1. MVP (фронтенд)** | Измеримые цели с дедлайном, записи прогресса по дням, расчёт нормы и отставания, экран «Сегодня», график, хранение в браузере | ✅ готово |
| 2. Бэкенд на DRF | Django + DRF, PostgreSQL, те же сущности, JWT-авторизация, фронтенд переключается на HTTP-клиент | следующий шаг |
| 3. Проекты и подзадачи | Большая цель разбивается на задачи-чекбоксы и подцели; прогресс проекта = доля выполненных задач | |
| 4. Привычки | Регулярные цели без итоговой суммы: «английский 20 минут каждый день», «3 тренировки в неделю» | |
| 5. Напоминания | Web Push / Telegram-бот: «сегодня ещё не отмечено чтение» | |
| 6. PWA | Установка на телефон, офлайн-режим | |

## Предметная модель (MVP)

```
Goal 1 ──── * ProgressEntry
```

**Goal** — измеримая цель.

| Поле | Тип | Пример |
|------|-----|--------|
| `id` | UUID | |
| `title` | строка | «Прочитать „Атлант расправил плечи“» |
| `description` | текст | заметки, мотивация |
| `category` | `reading` \| `language` \| `sport` \| `study` \| `other` | `reading` |
| `unit` | строка | «стр.», «часов», «тренировок» |
| `targetValue` | число > 0 | 480 |
| `startDate` | дата | 2026-09-20 |
| `deadline` | дата ≥ startDate | 2026-10-19 |
| `priority` | `high` \| `medium` \| `low` | `high` |
| `status` | `active` \| `archived` | `active` |
| `createdAt` | дата-время | |

**ProgressEntry** — запись прогресса. В один день можно добавить несколько записей
(утром 10 страниц, вечером ещё 15), они суммируются.

| Поле | Тип |
|------|-----|
| `id` | UUID |
| `goalId` | FK → Goal |
| `date` | дата (от `startDate` до сегодня) |
| `value` | число > 0 |
| `note` | строка, необязательно |
| `createdAt` | дата-время |

Что **не хранится**, а вычисляется: текущий прогресс, «достигнута», «просрочена»,
«долгосрочная» (длительность > 30 дней), норма на сегодня, серия дней.
Так не бывает рассинхрона между записями и статусом.

## Правила расчёта

Логика — чистые функции в `frontend/src/domain/progress.ts`, покрыта тестами.

- **Длительность** `totalDays` = дни от старта до дедлайна включительно.
- **План в день** `dailyPlan` = `targetValue / totalDays`.
- **Ожидаемый прогресс**: к началу дня N ожидается `dailyPlan × N`.
- **Статус**:
  - `achieved` — набрано `targetValue`;
  - `upcoming` — старт ещё не наступил;
  - `overdue` — дедлайн прошёл, цель не набрана;
  - `ahead` — опережение больше дневной нормы;
  - `on_track` — на начало дня не отстаём;
  - `behind` — отстаём от линейного плана.
- **Норма на сегодня** = остаток на начало дня ÷ оставшиеся дни (включая сегодня),
  с округлением вверх. Если отстал, норма растёт, но отставание распределяется
  на все оставшиеся дни, а не падает на один день. В течение дня норма не меняется,
  меняется только «осталось на сегодня».
- **Серия** — дней подряд с прогрессом. Если сегодня ещё не отмечено, считаем со вчера,
  чтобы серия не «сгорала» утром.

## Фронтенд

**Стек:** React 19 + TypeScript, Vite, React Router, TanStack Query, Vitest.
Стили — обычный CSS с переменными (светлая и тёмная тема), без UI-библиотек.

```
frontend/src/
├── domain/         # предметная область, без React
│   ├── types.ts        Goal, ProgressEntry, входные DTO
│   ├── meta.ts         категории, приоритеты, склонение единиц
│   └── progress.ts     computeGoalStats, сортировка для экрана «Сегодня»
├── api/            # доступ к данным
│   ├── types.ts        интерфейс TrackerApi — контракт с бэкендом
│   ├── localApi.ts     реализация на localStorage (MVP)
│   ├── index.ts        выбор реализации
│   ├── hooks.ts        хуки TanStack Query: useGoalsWithStats, useCreateEntry, …
│   └── demo.ts         демо-данные
├── components/     # GoalCard, QuickLog, GoalForm, ProgressChart, EntryForm, EntryHistory, …
├── pages/          # TodayPage, GoalPage, NewGoalPage / EditGoalPage
└── lib/            # даты (строки YYYY-MM-DD, расчёты в UTC), форматирование, склонения
```

**Главный принцип:** компоненты не знают, где лежат данные. Они вызывают хуки из
`api/hooks.ts`, те обращаются к интерфейсу `TrackerApi`. Чтобы перейти на DRF,
достаточно написать `httpApi.ts` с тем же интерфейсом и подключить его в `api/index.ts`.

**Экраны:**

1. **Сегодня** (`/`) — сводка «сделано N из M» и группы целей: «Нужно сделать сегодня»
   (сначала отстающие, затем по приоритету и дедлайну), «Дедлайн прошёл»,
   «Сегодня уже сделано», «Запланированы», «Достигнуты», «Архив».
   На карточке: прогресс-бар с отметкой плана, норма на сегодня, быстрая запись
   (пустое поле = записать остаток нормы), статус темпа, серия, активность за 7 дней.
2. **Цель** (`/goals/:id`) — показатели, график «факт против плана», запись прогресса
   за любой прошедший день с комментарием, история с удалением, архив и удаление цели.
3. **Создание / редактирование** (`/goals/new`, `/goals/:id/edit`) — форма с быстрыми
   сроками (неделя, месяц, 3 месяца, полгода, год) и предпросмотром «≈ 16 стр. в день».

## Бэкенд (этап 2, проект)

**Стек:** Django 5, DRF, PostgreSQL, `djangorestframework-simplejwt`,
`djangorestframework-camel-case` (API в camelCase, как типы на фронтенде),
`django-filter`, `drf-spectacular` (OpenAPI-схема).

```python
class Goal(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="goals")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=Category.choices)
    unit = models.CharField(max_length=30)
    target_value = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    start_date = models.DateField()
    deadline = models.DateField()
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(deadline__gte=F("start_date")), name="deadline_after_start")]


class ProgressEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    goal = models.ForeignKey(Goal, on_delete=models.CASCADE, related_name="entries")
    date = models.DateField()
    value = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["goal", "date"])]
```

**API** (все запросы — только по объектам текущего пользователя):

| Метод | URL | Назначение |
|-------|-----|------------|
| GET | `/api/goals/?status=active` | список целей |
| POST | `/api/goals/` | создать |
| GET / PATCH / DELETE | `/api/goals/{id}/` | цель |
| GET | `/api/entries/?goal={id}&date_from=…` | записи (без `goal` — по всем целям) |
| POST | `/api/entries/` | добавить запись |
| DELETE | `/api/entries/{id}/` | удалить запись |
| POST | `/api/auth/token/`, `/api/auth/token/refresh/` | JWT |

Расчёт статистики на MVP-этапе остаётся на клиенте: он мгновенный, работает офлайн
и уже покрыт тестами. Когда целей и записей станет много, в `GET /api/goals/`
добавим агрегаты (`currentValue`, `todayValue`, `lastEntryDate`) через `annotate`,
а главный экран будет запрашивать только записи за последние 7 дней.

## Решения и компромиссы

- **Даты — строки `YYYY-MM-DD`**, как `DateField` в DRF. Расчёты в UTC, чтобы переход
  на летнее время не ломал разницу в днях. «Сегодня» — по часовому поясу пользователя.
- **UUID вместо автоинкремента** — id можно генерировать на клиенте (пригодится для офлайна)
  и нельзя перебрать чужие объекты.
- **Единица измерения — свободная строка.** Известные единицы («часов», «тренировок»)
  склоняются, остальные выводятся как есть.
- **Дискретные цели** («12 тренировок за месяц») на MVP показывают дробную норму
  («0,4 тренировки в день»). Правильное решение — отдельный тип «привычка» с частотой
  (этап 4).

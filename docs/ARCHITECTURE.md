# Трекер целей: архитектура и план

## Идея

Долгосрочные цели теряются в суете дня. Приложение превращает цель со сроком
(«прочитать 480 страниц к 19 октября») в **конкретную норму на сегодня**
(«сегодня: 18 стр.») и показывает, идёшь ли ты по плану.

Главный экран отвечает на один вопрос: **что мне нужно сделать сегодня, чтобы не отстать?**

## Этапы

Модули продукта, исходные идеи с поправками и план этапов описаны в [PRODUCT.md](PRODUCT.md).
Этот документ описывает техническое устройство того, что уже сделано (этапы 1–2),
и проект бэкенда.

## Предметная модель

```
Area 1 ──── * Goal 1 ──── * ProgressEntry
```

**Area** — сфера жизни: «Чтение», «Английский», «Спорт». Пользователь создаёт,
переименовывает, перекрашивает и упорядочивает их сам. При первом запуске создаются
четыре сферы по умолчанию.

| Поле | Тип |
|------|-----|
| `id` | UUID |
| `name` | строка |
| `color` | `clay` \| `ochre` \| `sage` \| `teal` \| `slate` \| `plum` \| `rose` \| `stone` |
| `icon` | ключ иконки: `book`, `languages`, `dumbbell`, `study`, … |
| `order` | число, порядок в списке |
| `createdAt` | дата-время |

**Goal** — измеримая цель.

| Поле | Тип | Пример |
|------|-----|--------|
| `id` | UUID | |
| `title` | строка | «Прочитать „Атлант расправил плечи“» |
| `description` | текст | заметки, мотивация |
| `areaId` | FK → Area или `null` | цель без сферы |
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

## Хранение и резервные копии

Пока данные лежат в `localStorage` браузера под ключом `tracker:data` в виде
`{ version, areas, goals, entries }`. Код — `frontend/src/api/schema.ts` и `localApi.ts`.

- **Версия схемы.** При каждом изменении модели растёт `SCHEMA_VERSION` и добавляется
  шаг миграции. При загрузке старые данные автоматически приводятся к текущей версии.
  Первая миграция (v1 → v2) заменила категории целей сферами. Ключ `tracker:v1`
  не удаляется и остаётся запасной копией.
- **Проверка.** После миграции данные проверяются: типы полей, формат дат, уникальность id.
  Висячие ссылки чинятся (цель удалённой сферы остаётся без сферы). Если данные повреждены,
  приложение показывает ошибку и не начинает молча с чистого листа.
- **Резервная копия** — JSON-файл `{ app: "tracker", version, exportedAt, areas, goals, entries }`.
  При восстановлении файл проходит ту же миграцию и проверку, поэтому копию старой версии
  можно восстановить в новой.

## Фронтенд

**Стек:** React 19 + TypeScript, Vite, React Router, TanStack Query, Vitest,
иконки Lucide, шрифты Literata и Onest (устанавливаются пакетами Fontsource, без внешних CDN).
Стили — обычный CSS на токенах: светлая и тёмная тема, цвета сфер, без UI-библиотек.

```
frontend/src/
├── domain/         # предметная область, без React
│   ├── types.ts        Area, Goal, ProgressEntry, входные DTO
│   ├── meta.ts         сферы по умолчанию, цвета и иконки, приоритеты, склонение единиц
│   └── progress.ts     computeGoalStats, округление нормы, сортировка для «Сегодня»
├── api/            # доступ к данным
│   ├── types.ts        интерфейс TrackerApi — контракт с бэкендом
│   ├── schema.ts       версия схемы, миграции, проверка, формат резервной копии
│   ├── localApi.ts     реализация на localStorage
│   ├── index.ts        выбор реализации, чтение резервной копии
│   ├── hooks.ts        хуки TanStack Query: useGoalsWithStats, useAreas, useImportData, …
│   └── demo.ts         демо-данные
├── components/     # Layout, GoalCard, QuickLog, GoalForm, ProgressChart, AreaSettings, DataSettings, …
├── pages/          # TodayPage, GoalsPage, GoalPage, GoalFormPages, SettingsPage
└── lib/            # даты (строки YYYY-MM-DD, расчёты в UTC), форматирование, склонения
```

**Главный принцип:** компоненты не знают, где лежат данные. Они вызывают хуки из
`api/hooks.ts`, те обращаются к интерфейсу `TrackerApi`. Чтобы перейти на DRF,
достаточно написать `httpApi.ts` с тем же интерфейсом и подключить его в `api/index.ts`.

**Навигация:** на компьютере — боковая панель (Сегодня, Цели, список сфер, Настройки),
на телефоне — нижняя панель (Сегодня, Цели, новая цель, Настройки).

**Экраны:**

1. **Сегодня** (`/`) — приветствие, сводка «сделано N из M» и группы целей:
   «Нужно сделать сегодня» (сначала отстающие, затем по приоритету и сроку),
   «Срок прошёл», «Сегодня уже сделано», «Запланированы», «Достигнуты».
   На карточке: иконка сферы, прогресс с отметкой плана, норма на сегодня, быстрая запись
   (пустое поле = записать остаток нормы), темп, серия, активность за 7 дней.
2. **Цели** (`/goals`, `/goals?area=<id>`) — все цели по группам «В работе»,
   «Запланированы», «Достигнуты», «Архив» с фильтром по сферам.
3. **Цель** (`/goals/:id`) — показатели, подсказка «что делать дальше», график
   «факт против плана», запись прогресса за любой прошедший день, история,
   архив и удаление с подтверждением.
4. **Создание / редактирование** (`/goals/new`, `/goals/:id/edit`) — выбор сферы,
   быстрые единицы и сроки, предпросмотр «≈ 16 стр. в день».
5. **Настройки** (`/settings`) — сферы (добавить, переименовать, цвет, иконка, порядок,
   удалить) и данные (скачать резервную копию, восстановить из файла, удалить всё).

## Бэкенд (проект)

**Стек:** Django 5, DRF, PostgreSQL, `djangorestframework-simplejwt`,
`djangorestframework-camel-case` (API в camelCase, как типы на фронтенде),
`django-filter`, `drf-spectacular` (OpenAPI-схема).

```python
class Area(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="areas")
    name = models.CharField(max_length=40)
    color = models.CharField(max_length=10, choices=AreaColor.choices)
    icon = models.CharField(max_length=20, choices=AreaIcon.choices)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order"]


class Goal(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="goals")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="goals")
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
| GET / POST | `/api/areas/` | сферы |
| PATCH / DELETE | `/api/areas/{id}/` | сфера (при удалении цели остаются без сферы) |
| GET | `/api/goals/?status=active` | список целей |
| POST | `/api/goals/` | создать |
| GET / PATCH / DELETE | `/api/goals/{id}/` | цель |
| GET | `/api/entries/?goal={id}&date_from=…` | записи (без `goal` — по всем целям) |
| POST | `/api/entries/` | добавить запись |
| DELETE | `/api/entries/{id}/` | удалить запись |
| GET | `/api/export/` | резервная копия в том же формате, что и сейчас |
| POST | `/api/import/` | восстановление из резервной копии |
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
  (этап 5 в PRODUCT.md).

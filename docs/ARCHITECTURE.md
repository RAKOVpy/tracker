# Трекер целей: архитектура и план

## Идея

Долгосрочные цели теряются в суете дня. Приложение превращает цель со сроком
(«прочитать 480 страниц к 19 октября») в **конкретную норму на сегодня**
(«сегодня: 18 стр.») и показывает, идёшь ли ты по плану.

Главный экран отвечает на один вопрос: **что мне нужно сделать сегодня, чтобы не отстать?**

## Этапы

Модули продукта, исходные идеи с поправками и план этапов описаны в [PRODUCT.md](PRODUCT.md).
Этот документ описывает техническое устройство того, что уже сделано
(этапы 1, 2, 3.1 и 3.2), и проект бэкенда. Формат заметок Obsidian описан
в [obsidian/README.md](../obsidian/README.md).

## Предметная модель

```
Area 1 ──── * Goal 1 ──── * ProgressEntry
Area 1 ──── * Material 1 ──── * Note 1 ──── * Review
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

**Material** — источник знаний: книга, курс, лекция, статья, видео.

| Поле | Тип |
|------|-----|
| `id` | UUID |
| `title` | строка |
| `type` | `book` \| `course` \| `lecture` \| `article` \| `video` \| `other` |
| `author`, `url` | строки, необязательно |
| `areaId` | FK → Area или `null` |
| `status` | `active` (изучаю) \| `queued` (хочу изучить) \| `done` \| `dropped` |
| `obsidianPath` | путь к странице материала в хранилище или `null` |
| `createdAt` | дата-время |

**Note** — заметка для повторения: тема, которую нужно помнить.

| Поле | Тип |
|------|-----|
| `id` | UUID |
| `title` | строка |
| `materialId` | FK → Material или `null` |
| `questions` | список строк — вопросы для самопроверки |
| `summary` | ключевые мысли, с которыми сверяешься после ответа |
| `obsidianUri` | `obsidian://…` или пустая строка |
| `status` | `active` \| `paused` (повторения приостановлены) |
| `addedOn` | дата добавления; первое повторение — на следующий день |
| `obsidianPath` | путь к файлу в хранилище, например `Заметки/Двоичный поиск.md`, или `null` |
| `createdAt` | дата-время |

**Review** — одно повторение заметки.

| Поле | Тип |
|------|-----|
| `id` | UUID |
| `noteId` | FK → Note |
| `date` | дата |
| `rating` | `again` (забыл) \| `hard` (с трудом) \| `good` (хорошо) \| `easy` (легко) |
| `explain` | «смог бы объяснить другому?»: `no` \| `hints` \| `yes` \| `null` (пропущено) |
| `taught` | объяснил кому-то на деле |
| `createdAt` | дата-время |

Что **не хранится**, а вычисляется:

- у целей — текущий прогресс, «достигнута», «просрочена», «долгосрочная»
  (длительность > 30 дней), норма на сегодня, серия дней;
- у заметок — уровень освоения, дата следующего повторения, последний интервал,
  число забываний. Они получаются «проигрыванием» журнала повторений, поэтому
  отмена оценки — это просто удаление записи из журнала, а смена алгоритма
  (например, на FSRS) пересчитает расписание по уже накопленной истории.

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

## Расписание повторений

Логика — чистые функции в `frontend/src/domain/review.ts`, покрыта тестами.

- **Лестница интервалов:** 1 → 3 → 7 → 16 → 35 → 90 → 180 дней. У заметки есть «ступень»
  — сколько успешных шагов пройдено.
- **Оценка после повторения:**
  - «хорошо» — интервал текущей ступени, ступень +1;
  - «легко» — интервал через ступень, ступень +2;
  - «с трудом» — предыдущий интервал, ступень не меняется;
  - «забыл» — повторить завтра, ступень падает вдвое (тему нужно освежить, но не с нуля).
- **Первое повторение** — на следующий день после добавления заметки.
  «Повторить сейчас» можно в любой момент, расписание считается от даты повторения.
- **Уровень освоения:** 1 — меньше двух успешных шагов; 2 — от двух; 3 — от четырёх
  (около месяца удержания); 4 — от уровня 2 и дважды подряд «смог бы объяснить: да, уверенно»
  (пропущенная самооценка серию не прерывает); 5 — то же и «объяснил кому-то на деле».
  «Забыл» сбрасывает серию уверенности и отметку «объяснил».
- **Очередь** — заметки со сроком не позже сегодня, не на паузе; сначала самые
  просроченные, затем слабее освоенные. Время на сессию — минута на вопрос,
  не меньше двух минут на заметку.

## Синхронизация с Obsidian

Код — `frontend/src/obsidian/`. Разбор и сопоставление — чистые функции с тестами
на файлах из `obsidian/example-vault`.

- **Чтение папки** (`vault.ts`). В Chrome и Edge — File System Access API: дескриптор папки
  хранится в IndexedDB, при синхронизации браузер может переспросить разрешение.
  В Firefox и Safari — `<input webkitdirectory>`, папку выбирают каждый раз.
  Читаются только `.md` до 1 МБ, служебные папки (`.obsidian`, `.trash`, `.git`) пропускаются.
  Файлы никуда не отправляются.
- **Разбор** (`parse.ts`, загружается отдельным чанком только при синхронизации — в нём YAML).
  Заметка для повторения — тег `review` или `review: true`; вопросы — список в разделе
  «Вопросы» и выноски `[!question]`; суть — раздел «Суть»; материал — свойство
  `material: "[[…]]"`; страница материала — `type: material`. Шаблоны (`{{title}}`, `{{date}}`)
  и комментарии `%% %%` пропускаются.
- **Сопоставление** (`sync.ts`, `applyVault`). Заметка узнаётся по пути к файлу; переименованный
  файл — по названию среди пропавших; заметка, созданная вручную, связывается с файлом
  с тем же названием. Из файла обновляются название, вопросы, суть, ссылка и материал;
  статус, дата добавления и журнал повторений остаются в трекере. Статус материала
  ведётся в трекере. Пропавшие заметки не удаляются — их можно приостановить из отчёта.
- **Новые заметки вводятся по 5 в день** (`NEW_NOTES_PER_DAY`): дата добавления
  распределяется по дням с учётом прошлых импортов. Дата создания заметки в Obsidian
  не используется, иначе старые заметки сразу стали бы просроченными.
- Заметки из Obsidian редактируются в Obsidian: в трекере вместо «Изменить» —
  «Изменить в Obsidian» (ссылка `obsidian://open?vault=…&file=…`).

## Хранение и резервные копии

Пока данные лежат в `localStorage` браузера под ключом `tracker:data` в виде
`{ version, areas, goals, entries, materials, notes, reviews }`.
Код — `frontend/src/api/schema.ts` и `localApi.ts`.

- **Версия схемы.** При каждом изменении модели растёт `SCHEMA_VERSION` и добавляется
  шаг миграции. При загрузке старые данные автоматически приводятся к текущей версии.
  v1 → v2 заменила категории целей сферами, v2 → v3 добавила материалы, заметки
  и повторения, v3 → v4 — путь к файлу Obsidian. Ключ `tracker:v1` не удаляется
  и остаётся запасной копией. Сведения о подключённом хранилище (`tracker:obsidian`)
  и дескриптор папки (IndexedDB) хранятся отдельно и в резервную копию не входят.
- **Проверка.** После миграции данные проверяются: типы полей, формат дат, уникальность id.
  Висячие ссылки чинятся: цель или материал удалённой сферы остаются без сферы, заметка
  удалённого материала — без материала, повторения удалённой заметки отбрасываются. Если данные повреждены,
  приложение показывает ошибку и не начинает молча с чистого листа.
- **Резервная копия** — JSON-файл `{ app: "tracker", version, exportedAt, ...все списки }`.
  При восстановлении файл проходит ту же миграцию и проверку, поэтому копию старой версии
  можно восстановить в новой.

## Фронтенд

**Стек:** React 19 + TypeScript, Vite, React Router, TanStack Query, Vitest,
иконки Lucide, шрифты Literata и Onest (устанавливаются пакетами Fontsource, без внешних CDN).
Стили — обычный CSS на токенах: светлая и тёмная тема, цвета сфер, без UI-библиотек.

```
frontend/src/
├── domain/         # предметная область, без React
│   ├── types.ts        Area, Goal, ProgressEntry, Material, Note, Review, входные DTO
│   ├── meta.ts         сферы по умолчанию, типы и статусы материалов, приоритеты, склонение единиц
│   ├── progress.ts     computeGoalStats, округление нормы, сортировка для «Сегодня»
│   └── review.ts       расписание повторений, уровни освоения, очередь
├── api/            # доступ к данным
│   ├── types.ts        интерфейс TrackerApi — контракт с бэкендом
│   ├── schema.ts       версия схемы, миграции, проверка, формат резервной копии
│   ├── localApi.ts     реализация на localStorage
│   ├── index.ts        выбор реализации, чтение резервной копии
│   ├── hooks.ts        хуки TanStack Query: useGoalsWithStats, useKnowledge, useAreas, …
│   └── demo.ts         демо-данные
├── components/     # Layout, CreateMenu, GoalCard, GoalForm, ProgressChart, AreaSettings, DataSettings, …
│   └── knowledge/      NoteForm, MaterialForm, MaterialCard, DueReviewsCard, лестница и строки заметок
│   └── obsidian/       ObsidianSettings, SyncReportView, ObsidianGuide (шаблоны с копированием)
├── obsidian/       # parse.ts, sync.ts, vault.ts, useObsidian.ts, templates.ts (из ../obsidian/templates)
├── pages/          # TodayPage, GoalsPage, GoalPage, GoalFormPages, SettingsPage, CreatePage
│   └── knowledge/      KnowledgePage, MaterialPages, NotePages, ReviewPage
└── lib/            # даты (строки YYYY-MM-DD, расчёты в UTC), форматирование, склонения
```

**Главный принцип:** компоненты не знают, где лежат данные. Они вызывают хуки из
`api/hooks.ts`, те обращаются к интерфейсу `TrackerApi`. Чтобы перейти на DRF,
достаточно написать `httpApi.ts` с тем же интерфейсом и подключить его в `api/index.ts`.

**Навигация:** на компьютере — боковая панель: кнопка «Создать» (цель, заметка, материал),
Сегодня, Цели, Знания с числом заметок к повторению, список сфер, Настройки.
На телефоне — нижняя панель: Сегодня, Цели, Создать, Знания, Настройки.

**Экраны:**

1. **Сегодня** (`/`) — приветствие, карточка «N заметок к повторению», сводка «сделано N из M» и группы целей:
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
5. **Знания** (`/knowledge`) — карточка «к повторению», материалы «Изучаю» и «Хочу изучить»,
   все заметки с уровнем и датой следующего повторения, изученные и отложенные материалы.
6. **Материал** (`/knowledge/materials/:id`) — статус в одно нажатие, ссылка, заметки материала.
7. **Заметка** (`/knowledge/notes/:id`) — следующее повторение, вопросы, ключевые мысли,
   лестница освоения, журнал повторений (запись можно удалить), пауза, «Повторить сейчас»,
   «Открыть в Obsidian».
8. **Повторение** (`/review`, `/review?note=<id>`) — очередь фиксируется в начале сессии.
   Вопросы → «Проверить себя» (или пробел) → ключевые мысли и ссылка на Obsidian →
   необязательная самооценка «смог бы объяснить?» и «объяснил на деле» → оценка
   (клавиши 1–4) с датой следующего повторения на кнопке. Последнюю оценку можно отменить.
   В конце — итог: что повторено, у кого вырос уровень, когда следующее повторение.
9. **Создание заметки и материала** (`/knowledge/notes/new?material=<id>`,
   `/knowledge/materials/new`) — вопросы добавляются по Enter; ссылка на Obsidian проверяется.
10. **Настройки** (`/settings`) — сферы (добавить, переименовать, цвет, иконка, порядок,
    удалить), Obsidian (`/settings#obsidian`: выбрать папку, синхронизировать, отчёт,
    инструкция и шаблоны) и данные (скачать резервную копию, восстановить, удалить всё).
    В «Знаниях» — кнопка синхронизации с Obsidian.

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


class Material(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField(max_length=300)
    type = models.CharField(max_length=10, choices=MaterialType.choices)
    author = models.CharField(max_length=200, blank=True)
    url = models.URLField(blank=True)
    area = models.ForeignKey(Area, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials")
    status = models.CharField(max_length=10, choices=MaterialStatus.choices, default=MaterialStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)


class Note(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=300)
    material = models.ForeignKey(Material, null=True, blank=True, on_delete=models.SET_NULL, related_name="notes")
    questions = models.JSONField(default=list)
    summary = models.TextField(blank=True)
    obsidian_uri = models.CharField(max_length=1000, blank=True)
    obsidian_path = models.CharField(max_length=1000, null=True, blank=True)
    status = models.CharField(max_length=10, choices=NoteStatus.choices, default=NoteStatus.ACTIVE)
    added_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name="reviews")
    date = models.DateField()
    rating = models.CharField(max_length=5, choices=Rating.choices)
    explain = models.CharField(max_length=5, choices=Explain.choices, null=True, blank=True)
    taught = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["note", "date"])]
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
| GET / POST | `/api/materials/` | материалы |
| PATCH / DELETE | `/api/materials/{id}/` | материал (при удалении заметки остаются без материала) |
| GET / POST | `/api/notes/` | заметки |
| PATCH / DELETE | `/api/notes/{id}/` | заметка (удаляется вместе с повторениями) |
| GET / POST | `/api/reviews/` | журнал повторений |
| DELETE | `/api/reviews/{id}/` | отмена оценки |
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

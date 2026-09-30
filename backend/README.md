# Бэкенд трекера

Django 5.2 + Django REST Framework, PostgreSQL (для разработки хватает SQLite).
API повторяет модель и правила фронтенда: те же поля в camelCase, тот же формат резервной копии,
те же правила повторов, отпусков и отвязки при удалении. Устройство — в [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Запуск для разработки

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 8000     # http://localhost:8000/api/
```

Без переменных окружения включён режим разработки и база SQLite `backend/db.sqlite3`.
С PostgreSQL: `DATABASE_URL=postgres://user:password@localhost:5432/tracker`.
Все настройки — в [.env.example](.env.example).

```bash
.venv/bin/python -m pytest                                  # тесты (SQLite)
DATABASE_URL=postgres://… .venv/bin/python -m pytest        # те же тесты на PostgreSQL
.venv/bin/python manage.py createsuperuser                  # админка: /admin/
.venv/bin/python manage.py spectacular --file schema.yml    # OpenAPI-схема (или GET /api/schema/)
```

## Вместе с фронтендом

Django на порту 8000, фронтенд — с адресом API:

```bash
cd frontend
VITE_API_URL=/api npm run dev        # http://localhost:5173
```

Vite проксирует `/api` на `http://127.0.0.1:8000` (другой адрес — переменная `BACKEND_URL`),
поэтому для браузера сайт и API на одном адресе и кука сессии работает как на рабочем сервере.
Первый аккаунт создаётся на экране входа кнопкой «Зарегистрироваться».

## Вход

Почта и пароль, сессия в httpOnly-куке. Запросы с изменениями передают CSRF-токен из куки
`csrftoken` в заголовке `X-CSRFToken`. Порядок для клиента:

1. `GET /api/auth/session/` — кто вошёл (`user` или `null`) и открыта ли регистрация; ставит куку CSRF.
2. `POST /api/auth/login/` или `/api/auth/register/` с `{ "email", "password" }`.
3. Дальше — любые запросы к `/api/…`. Без входа — `401`, без CSRF-токена — `403`.

Фронтенд присылает часовой пояс в заголовке `X-Timezone` (например, `Europe/Moscow`):
по нему сервер понимает, какое у пользователя «сегодня» — это нужно для повторяющихся задач.

Сессия живёт 90 дней с последнего открытия трекера. Пароль меняется в настройках трекера
(`POST /api/auth/password/`), забытый — на сервере:

```bash
.venv/bin/python manage.py changepassword me@example.com
```

Регистрацию на личном сервере стоит закрыть после создания своего аккаунта: `ALLOW_REGISTRATION=0`.

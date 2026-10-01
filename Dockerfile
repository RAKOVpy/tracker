# Образы трекера для своего сервера. Собирает их docker compose из папки deploy (docs/DEPLOY.md):
#   app    — Django и gunicorn: API и админка;
#   web    — Caddy: собранный фронтенд, HTTPS-сертификат, прокси к app;
#   backup — резервные копии базы по расписанию.

# ---------- фронтенд ----------
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Шаблоны Obsidian встраиваются в приложение как текст.
COPY obsidian/ ../obsidian/
# Фронтенд работает через сервер на том же адресе.
ENV VITE_API_URL=/api
# Только сборка, без проверки типов (tsc из npm run build): на одном ядре VPS она шла бы минуты и заняла бы
# ещё 400 МБ памяти, а сайту не нужна — типы проверяются при разработке. Сборке хватает 400 МБ.
RUN npx vite build

# ---------- сервер ----------
FROM python:3.12-slim AS app
# WEB_CONCURRENCY — процессы gunicorn: двух хватает нескольким людям на сервере с 1 ГБ памяти.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore \
    WEB_CONCURRENCY=2
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
# Статика админки собирается в образ, раздаёт её WhiteNoise.
RUN DJANGO_DEBUG=0 DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput
COPY deploy/app-entrypoint.sh /usr/local/bin/app-entrypoint
RUN chmod 755 /usr/local/bin/app-entrypoint && useradd --system --no-create-home tracker
USER tracker
EXPOSE 8000
ENTRYPOINT ["app-entrypoint"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--no-control-socket"]

# ---------- веб-сервер ----------
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /src/frontend/dist /srv

# ---------- резервные копии ----------
# Версия PostgreSQL — та же, что у базы в deploy/compose.yaml: pg_dump должен быть не старше сервера.
FROM postgres:18-alpine AS backup
# rclone — для копий в облачное хранилище, если оно настроено.
RUN apk add --no-cache rclone
COPY deploy/backup.sh /usr/local/bin/backup
RUN chmod 755 /usr/local/bin/backup
ENTRYPOINT ["backup"]
CMD ["schedule"]

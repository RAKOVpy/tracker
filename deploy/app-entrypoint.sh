#!/bin/sh
# Перед запуском сервера — миграции базы: после обновления новые таблицы и поля появляются сами.
set -e
python manage.py migrate --noinput
exec "$@"

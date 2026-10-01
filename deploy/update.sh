#!/bin/sh
# Обновление трекера на сервере:  ./update.sh
# Копия базы, свежий код из git, пересборка и перезапуск. Миграции база получает при запуске app.
set -eu

# Весь скрипт читается до запуска: git pull может поменять и этот файл.
main() {
	cd "$(dirname "$0")"
	if docker compose ps --status running --services | grep -qx backup; then
		echo "Копия базы перед обновлением:"
		docker compose exec -T backup backup now
	fi
	git pull --ff-only
	docker compose up -d --build
	# Образы прежних сборок не нужны, кэш сборки старше месяца — тоже: диск не забивается.
	docker image prune -f >/dev/null
	docker builder prune -f --filter until=720h >/dev/null
	docker compose ps
}

main "$@"
exit

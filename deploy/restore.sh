#!/bin/sh
# Замена базы трекера резервной копией:  ./restore.sh backups/tracker-2026-10-01_033000.dump
# Сначала делается копия того, что в базе сейчас, — если передумаете, восстановите её так же.
set -eu

main() {
	if [ $# -ne 1 ] || [ ! -f "$1" ]; then
		echo "Укажите файл копии, например: ./restore.sh backups/tracker-2026-10-01_033000.dump" >&2
		echo "Список копий: ls backups" >&2
		exit 1
	fi
	file=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
	# Файл открыт заранее: что бы ни случилось с ним дальше, восстановится выбранная копия.
	exec 3<"$file"
	cd "$(dirname "$0")"

	printf 'Заменить базу трекера копией %s? Всё, что изменилось после неё, пропадёт. [да/нет] ' "$(basename "$file")"
	read -r answer
	case $answer in
	да | Да | ДА | y | Y | yes) ;;
	*)
		echo "Отменено."
		exit 1
		;;
	esac

	echo "Копия текущей базы:"
	docker compose exec -T backup backup now
	docker compose stop app
	if docker compose exec -T backup backup restore <&3; then
		docker compose start app
		echo "Готово: база восстановлена из $(basename "$file"). Обновите страницу трекера."
	else
		docker compose start app
		echo "Не получилось — база осталась прежней." >&2
		exit 1
	fi
}

main "$@"

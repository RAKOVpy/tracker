#!/bin/sh
# Резервные копии базы трекера — команда backup в контейнере backup (deploy/compose.yaml):
#   backup now               сделать копию сейчас
#   backup schedule          каждый день в BACKUP_TIME, а при запуске — сразу, если сегодня копии ещё нет
#   backup restore < файл    заменить базу копией (это делает deploy/restore.sh)
#
# Копия — /backups/tracker-ГГГГ-ММ-ДД_ЧЧММСС.dump (pg_dump, свой сжатый формат). После каждой копии
# старые удаляются: остаются все за BACKUP_KEEP_DAYS дней и последняя копия каждой из BACKUP_KEEP_WEEKS
# недель и каждого из BACKUP_KEEP_MONTHS месяцев. Задан BACKUP_REMOTE — новые копии уходят туда через rclone.
#
# Ошибки проверяются явно: set -e не действует внутри функций, вызванных через || .
set -u
# В копии все данные трекера — читать файлы может только владелец.
umask 077

DIR=/backups
AT=${BACKUP_TIME:-03:30}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
KEEP_WEEKS=${BACKUP_KEEP_WEEKS:-8}
KEEP_MONTHS=${BACKUP_KEEP_MONTHS:-12}
NAME_PATTERN='^tracker-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.dump$'

log() {
	echo "$(date '+%F %T') $*"
}

fail() {
	log "ОШИБКА: $*" >&2
	return 1
}

backup_now() {
	mkdir -p "$DIR" || return 1
	part=$(mktemp "$DIR/.unfinished.XXXXXX") || return 1
	if ! pg_dump --format=custom --no-owner --file="$part"; then
		rm -f "$part"
		fail "копия не сделана: база недоступна?"
		return 1
	fi
	# Имя — время конца копии. Готовая копия не перезаписывается никогда: ln не заменяет существующий
	# файл, так что даже две копии в одну секунду не столкнутся — вторая подождёт следующую.
	file="$DIR/tracker-$(date +%F_%H%M%S).dump"
	while ! ln "$part" "$file" 2>/dev/null; do
		if [ ! -e "$file" ]; then
			rm -f "$part"
			fail "не удалось сохранить копию в $DIR"
			return 1
		fi
		sleep 1
		file="$DIR/tracker-$(date +%F_%H%M%S).dump"
	done
	rm -f "$part"
	log "копия ${file#"$DIR"/}, $(du -h "$file" | cut -f1)"
	rotate
	offsite
}

# Удаляет старые копии. Файлы — от новых к старым, поэтому первая встреченная копия недели
# или месяца — последняя за неё.
rotate() {
	today=$(date -d "$(date +%F)" +%s)
	find "$DIR" -maxdepth 1 -name 'tracker-*.dump' | sed 's|.*/||' | grep -E "$NAME_PATTERN" | sort -r | {
		weeks=' ' months=' ' week_count=0 month_count=0 removed=0
		while read -r name; do
			day=${name#tracker-}
			day=${day%%_*}
			keep=
			if [ $(((today - $(date -d "$day" +%s)) / 86400)) -lt "$KEEP_DAYS" ]; then
				keep=1
			fi
			week=$(date -d "$day" +%G-%V)
			case $weeks in
			*" $week "*) ;;
			*)
				weeks="$weeks$week "
				week_count=$((week_count + 1))
				if [ "$week_count" -le "$KEEP_WEEKS" ]; then keep=1; fi
				;;
			esac
			month=${day%-*}
			case $months in
			*" $month "*) ;;
			*)
				months="$months$month "
				month_count=$((month_count + 1))
				if [ "$month_count" -le "$KEEP_MONTHS" ]; then keep=1; fi
				;;
			esac
			if [ -z "$keep" ]; then
				rm -f "$DIR/$name"
				removed=$((removed + 1))
			fi
		done
		if [ "$removed" -gt 0 ]; then log "удалено старых копий: $removed"; fi
	}
	# Недописанные копии — остались, если контейнер остановили посреди pg_dump.
	find "$DIR" -maxdepth 1 -name '.unfinished.*' -mmin +60 -delete
}

offsite() {
	if [ -z "${BACKUP_REMOTE:-}" ]; then return 0; fi
	if rclone copy "$DIR" "$BACKUP_REMOTE" --include 'tracker-*.dump' --log-level ERROR; then
		log "копии отправлены в $BACKUP_REMOTE"
	else
		fail "копии не отправлены в $BACKUP_REMOTE — проверьте RCLONE_CONFIG_* в deploy/.env"
	fi
}

at_time() {
	date -d "$1 $AT" +%s
}

schedule() {
	if ! at_time "$(date +%F)" >/dev/null 2>&1; then
		log "BACKUP_TIME=$AT: нужно время ЧЧ:ММ, например 03:30" >&2
		exit 1
	fi
	# docker compose stop не ждёт конца sleep: сигнал прерывает wait.
	trap 'exit 0' TERM INT
	log "копии каждый день в $AT в папке deploy/backups"
	if [ -z "$(find "$DIR" -maxdepth 1 -name "tracker-$(date +%F)_*.dump" 2>/dev/null)" ]; then
		backup_now
	fi
	while true; do
		now=$(date +%s)
		next=$(at_time "$(date +%F)")
		if [ "$next" -le "$now" ]; then
			next=$(at_time "$(date -d "@$((now + 86400))" +%F)")
		fi
		sleep $((next - now)) &
		wait $!
		backup_now || log "следующая попытка — завтра в $AT"
	done
}

# Копия грузится во временную базу; только если она загрузилась целиком, базы меняются местами.
# Битая копия базу не тронет.
restore() {
	# Без сообщений «базы ещё нет, пропускаю».
	export PGOPTIONS='-c client_min_messages=warning'
	db=${PGDATABASE:-tracker}
	tmp=${db}_restore
	log "загружаю копию во временную базу $tmp"
	dropdb --if-exists "$tmp" && createdb "$tmp" || return 1
	if ! pg_restore --dbname="$tmp" --no-owner --exit-on-error; then
		dropdb --if-exists "$tmp"
		fail "копию не удалось загрузить, база не изменилась"
		return 1
	fi
	psql --dbname=postgres --quiet -v ON_ERROR_STOP=1 >/dev/null <<-SQL || return 1
		DROP DATABASE IF EXISTS "${db}_old";
		SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();
		ALTER DATABASE "$db" RENAME TO "${db}_old";
		ALTER DATABASE "$tmp" RENAME TO "$db";
		DROP DATABASE "${db}_old";
	SQL
	log "база заменена копией"
}

case ${1:-} in
now) backup_now ;;
schedule) schedule ;;
restore) restore ;;
*)
	echo "Команды: backup now | backup schedule | backup restore < файл" >&2
	exit 2
	;;
esac

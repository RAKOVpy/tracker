#!/bin/sh
# Первая настройка сервера:  ./setup.sh tracker.example.com
# Создаёт deploy/.env с доменом и случайными паролями. Остальное в нём можно поменять потом.
set -eu

secret() {
	# Только буквы и цифры: пароль базы стоит внутри адреса DATABASE_URL.
	LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"
}

main() {
	cd "$(dirname "$0")"
	if [ -e .env ]; then
		echo "deploy/.env уже есть — не трогаю: в нём пароль базы, с которым она создана." >&2
		echo "Поменять домен или другие настройки можно прямо в нём, затем: docker compose up -d" >&2
		exit 1
	fi
	domain=${1:-}
	if [ -z "$domain" ]; then
		printf 'Домен трекера (например, tracker.example.com): '
		read -r domain
	fi
	domain=$(printf '%s' "$domain" | sed -e 's|^https\?://||' -e 's|/.*$||')
	if [ -z "$domain" ]; then
		echo "Нужен домен: по нему Caddy получит HTTPS-сертификат." >&2
		exit 1
	fi

	umask 077
	sed -e "s|^DOMAIN=.*|DOMAIN=$domain|" \
		-e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(secret 50)|" \
		-e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 32)|" \
		.env.example >.env
	echo "Готово: deploy/.env для https://$domain"
	echo "Дальше: docker compose up -d --build"
}

main "$@"

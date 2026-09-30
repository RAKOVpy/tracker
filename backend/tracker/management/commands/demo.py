from datetime import date

from django.core.management.base import BaseCommand, CommandError

from tracker.demo import DEMO_EMAIL, DEMO_PASSWORD, DemoError, create_demo


class Command(BaseCommand):
    help = (
        "Создаёт демо-аккаунт: трекер, который ведут около четырёх месяцев, со связанным хранилищем "
        "obsidian/example-vault. Повторный запуск пересоздаёт данные на сегодня."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEMO_EMAIL, help=f"Почта для входа (по умолчанию {DEMO_EMAIL}).")
        parser.add_argument("--password", default=DEMO_PASSWORD, help=f"Пароль (по умолчанию {DEMO_PASSWORD}).")
        parser.add_argument(
            "--vault-name",
            help="Имя хранилища Obsidian для ссылок «Открыть в Obsidian», если папку example-vault переименовали или скопировали.",
        )
        parser.add_argument("--today", help="Дата ГГГГ-ММ-ДД, от которой считать историю. По умолчанию — сегодня.")

    def handle(self, *args, email, password, vault_name, today, **options):
        try:
            day = date.fromisoformat(today) if today else date.today()
        except ValueError:
            raise CommandError("Дата --today должна быть в виде ГГГГ-ММ-ДД.") from None
        try:
            user = create_demo(day, email, password, vault_name)
        except DemoError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f"Демо-аккаунт готов: история за четыре месяца по {day:%d.%m.%Y}."))
        self.stdout.write(f"  Почта:  {user.email}\n  Пароль: {password}")
        self.stdout.write(
            "Войдите на http://localhost:5173. Хранилище Obsidian к демо — папка obsidian/example-vault,\n"
            "как его подключить и что посмотреть — docs/DEMO.md.\n"
            "Даты считаются от сегодняшнего дня: перед следующим показом запустите команду ещё раз."
        )

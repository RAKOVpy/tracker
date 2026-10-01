import getpass
import sys

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email


class Command(BaseCommand):
    help = (
        "Создаёт аккаунт трекера — например, на сервере с закрытой регистрацией. "
        "Пароль спрашивает дважды; без терминала читает его одной строкой из stdin. "
        "С --admin у уже существующего аккаунта только добавляет права администратора."
    )
    # Тесты подставляют свой ввод.
    stealth_options = ("stdin",)

    def add_arguments(self, parser):
        parser.add_argument("email", help="Почта — с ней входят в трекер.")
        parser.add_argument(
            "--admin", action="store_true", help="Администратор: раздел «Сервер» в настройках трекера и админка /admin/."
        )

    def handle(self, *args, email, admin, **options):
        User = get_user_model()
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError("Похоже, в адресе почты опечатка.") from None
        existing = User.objects.filter(username=email).first()
        if existing and admin:
            User.objects.filter(pk=existing.pk).update(is_staff=True, is_superuser=True)
            self.stdout.write(self.style.SUCCESS(f"{email} теперь администратор: раздел «Сервер» — в настройках трекера."))
            return
        if existing:
            raise CommandError(f"Аккаунт {email} уже есть. Сменить пароль: manage.py changepassword {email}")

        stdin = options.get("stdin") or sys.stdin
        candidate = User(username=email, email=email)
        try:
            password = self.ask_password(candidate) if stdin.isatty() else self.read_password(stdin, candidate)
        except (KeyboardInterrupt, EOFError):
            raise CommandError("Отменено, аккаунт не создан.") from None

        # Сферы по умолчанию и настройки создаёт сигнал (signals.py), как при регистрации.
        User.objects.create_user(username=email, email=email, password=password, is_staff=admin, is_superuser=admin)
        self.stdout.write(self.style.SUCCESS(f"Аккаунт {email} создан: входите с этой почтой и паролем."))
        if admin:
            self.stdout.write("Администратор: раздел «Сервер» — в настройках трекера, админка — /admin/.")

    def ask_password(self, user) -> str:
        while True:
            password = getpass.getpass("Пароль: ")
            if password != getpass.getpass("Ещё раз: "):
                self.stderr.write("Пароли не совпали, попробуйте снова.")
                continue
            try:
                validate_password(password, user)
            except ValidationError as error:
                self.stderr.write(" ".join(error.messages))
                continue
            return password

    def read_password(self, stdin, user) -> str:
        password = stdin.readline().rstrip("\r\n")
        if not password:
            raise CommandError("Пароль не задан: запустите команду в терминале или передайте пароль строкой в stdin.")
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from None
        return password

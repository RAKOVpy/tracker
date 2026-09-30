from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .defaults import create_default_areas, user_settings


@receiver(post_save, sender=get_user_model())
def create_user_defaults(sender, instance, created: bool, raw: bool = False, **kwargs) -> None:
    """Новый пользователь сразу получает сферы по умолчанию и настройки — как при первом запуске фронтенда."""
    if created and not raw:
        create_default_areas(instance)
        user_settings(instance)

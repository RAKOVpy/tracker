"""
Ошибки API в одном виде: {"detail": "текст для пользователя", "errors": {...}}.
detail — первое сообщение, его фронтенд показывает как есть; errors — подробности по полям.
"""

from rest_framework.views import exception_handler as drf_exception_handler


def _first_message(data) -> str | None:
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        for item in data:
            message = _first_message(item)
            if message:
                return message
    if isinstance(data, dict):
        if "detail" in data:
            return _first_message(data["detail"])
        for value in data.values():
            message = _first_message(value)
            if message:
                return message
    return None


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    detail = _first_message(data) or "Что-то пошло не так."
    response.data = {"detail": detail} if isinstance(data, dict) and set(data) == {"detail"} else {"detail": detail, "errors": data}
    return response

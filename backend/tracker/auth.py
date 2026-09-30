from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """Сессия Django; без входа — 401, а не 403, чтобы фронтенд отличал «нужно войти» от «нельзя»."""

    def authenticate_header(self, request) -> str:
        return "Session"

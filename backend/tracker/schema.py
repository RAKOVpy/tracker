"""Описание API для OpenAPI-схемы (/api/schema/): вход по сессионной куке."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SessionScheme(OpenApiAuthenticationExtension):
    target_class = "tracker.auth.SessionAuthentication"
    name = "session"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": "sessionid"}

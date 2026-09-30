from django.urls import path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.routers import SimpleRouter

from . import auth_views, views

router = SimpleRouter()
router.register("areas", views.AreaViewSet, basename="area")
router.register("goals", views.GoalViewSet, basename="goal")
router.register("entries", views.EntryViewSet, basename="entry")
router.register("materials", views.MaterialViewSet, basename="material")
router.register("notes", views.NoteViewSet, basename="note")
router.register("reviews", views.ReviewViewSet, basename="review")
router.register("vacations", views.VacationViewSet, basename="vacation")
router.register("tasks", views.TaskViewSet, basename="task")
router.register("projects", views.ProjectViewSet, basename="project")

urlpatterns = [
    path("auth/session/", auth_views.SessionView.as_view(), name="auth-session"),
    path("auth/login/", auth_views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", auth_views.LogoutView.as_view(), name="auth-logout"),
    path("auth/register/", auth_views.RegisterView.as_view(), name="auth-register"),
    path("auth/password/", auth_views.PasswordView.as_view(), name="auth-password"),
    path("settings/", views.SettingsView.as_view(), name="settings"),
    path("export/", views.ExportView.as_view(), name="export"),
    path("import/", views.ImportView.as_view(), name="import"),
    path("reset/", views.ResetView.as_view(), name="reset"),
    path("obsidian/apply/", views.ObsidianApplyView.as_view(), name="obsidian-apply"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    *router.urls,
]

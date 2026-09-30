from django.contrib import admin

from .models import Area, Goal, Material, Note, ProgressEntry, Project, Review, Task, UserSettings, Vacation


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "color", "order"]
    list_filter = ["user"]


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "target_value", "unit", "deadline", "status"]
    list_filter = ["user", "status"]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "status", "planned_date", "deadline", "important"]
    list_filter = ["user", "status"]
    search_fields = ["title"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "status", "deadline"]
    list_filter = ["user", "status"]


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "type", "status"]
    list_filter = ["user", "status"]


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "status", "added_on"]
    list_filter = ["user", "status"]
    search_fields = ["title"]


admin.site.register(ProgressEntry)
admin.site.register(Review)
admin.site.register(Vacation)
admin.site.register(UserSettings)

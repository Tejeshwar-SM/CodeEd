from django.db import models
from django.contrib.auth.models import User

class Project(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')

    def __str__(self):
        return self.name

class File(models.Model):
    name = models.CharField(max_length=100)
    content = models.TextField(blank=True)
    language = models.CharField(max_length=50, default='python')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='files')
    path = models.CharField(max_length=255, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.project.name} - {self.name}"

    class Meta:
        unique_together = ('project', 'path', 'name')

class UserPreferences(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preferences')
    theme = models.CharField(max_length=20, default='light')
    font_size = models.IntegerField(default=14)
    tab_size = models.IntegerField(default=4)
    auto_save = models.BooleanField(default=True)
    show_minimap = models.BooleanField(default=False)
    word_wrap = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} Preferences"
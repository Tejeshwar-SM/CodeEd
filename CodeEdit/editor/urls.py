from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, FileViewSet, UserPreferencesViewSet

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'files', FileViewSet, basename='file')
router.register(r'user-preferences', UserPreferencesViewSet, basename='userpreferences')

urlpatterns = [
    path('', include(router.urls)),
]


from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import ProjectViewSet, FileViewSet, UserPreferencesViewSet, register_user, execute_code

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'files', FileViewSet, basename='file')
router.register(r'user-preferences', UserPreferencesViewSet, basename='userpreferences')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/register/', register_user, name='register'),
    path('auth/me/', views.get_current_user, name='current_user'),
    path('execute/', execute_code, name='execute_code'),
]
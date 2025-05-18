from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers
# from django.shortcuts import get_object_or_404

from .models import Project, File, UserPreferences
from .serializers import (
    ProjectSerializer,
    FileSerializer,
    UserPreferencesSerializer,
    FileContentSerializer,
)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only return projects owned by the authenticated user
        return Project.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FileViewSet(viewsets.ModelViewSet):
    serializer_class = FileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return File.objects.filter(project__owner=self.request.user)

    def perform_create(self, serializer):
        project_id = self.request.data.get('project')
        if not project_id:
            raise serializers.ValidationError({"project": "Project ID is required"})
        serializer.save(project_id=project_id)

    @action(detail=True, methods=['get', 'put'])
    def content(self, request, pk=None):
        file = self.get_object()
        if request.method == 'GET':
            serializer = FileContentSerializer(file)
            return Response(serializer.data)
        elif request.method == 'PUT':
            serializer = FileContentSerializer(file, data=request.data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=400)
        return None


class UserPreferencesViewSet(viewsets.ModelViewSet):
    serializer_class = UserPreferencesSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserPreferences.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        try:
            prefs = UserPreferences.objects.get(user=self.request.user)
            # update existing preferences
            serializer = self.get_serializer(prefs, data=self.request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        except UserPreferences.DoesNotExist:
            serializer.save(user=self.request.user)
from rest_framework import serializers
from .models import Project, File, UserPreferences
from django.contrib.auth.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ['id', 'name', 'content', 'language', 'path', 'project', 'created_at', 'updated_at']


class FileContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ['id', 'content']


class ProjectSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    files = FileSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'created_at', 'updated_at', 'owner', 'files']

    def create(self, validated_data):
        # Set the owner to the current user
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreferences
        fields = ['id', 'theme', 'font_size', 'tab_size', 'auto_save', 'show_minimap', 'word_wrap']
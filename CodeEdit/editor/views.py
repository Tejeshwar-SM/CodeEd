import subprocess
import tempfile
import os
from rest_framework import status, viewsets, permissions, serializers
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt

from .serializers import (
    ProjectSerializer,
    FileSerializer,
    UserPreferencesSerializer,
    FileContentSerializer,
    UserSerializer,
)
from .models import Project, File, UserPreferences

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def execute_code(request):
    """Execute code and return the output """
    file_id = request.data.get('file_id')
    language = request.data.get('language')
    code = request.data.get('code')

    if not code:
        return Response({'detail': 'No code provided'}, status=400)

    try:
        #Get the file if file_id is provided to verify ownership
        if file_id:
            try:
                file = File.objects.get(id=file_id, project__owner=request.user)
            except File.DoesNotExist:
                return Response({'detail': 'File not found'}, status=404)
        result = ''
        error = ''

        #Execute code based on language
        if language == 'python':
            with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as temp_file:
                temp_file.write(code.encode())
                temp_file_name = temp_file.name

            try:
                # Run with timeout protection
                process = subprocess.run(
                    ['python', temp_file_name],
                    capture_output=True,
                    text=True,
                    timeout=5  # 5 second timeout for safety
                )
                result = process.stdout
                error = process.stderr

            except subprocess.TimeoutExpired:
                error = "Execution timed out (limit: 5 seconds)"
            finally:
                # Clean up the temp file
                os.unlink(temp_file_name)

        elif language in ['javascript', 'typescript']:
            with tempfile.NamedTemporaryFile(suffix='.js', delete=False) as temp_file:
                temp_file.write(code.encode())
                temp_file_name = temp_file.name

            try:
                # Run with Node.js
                process = subprocess.run(
                    ['node', temp_file_name],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                result = process.stdout
                error = process.stderr
            except subprocess.TimeoutExpired:
                error = "Execution timed out (limit: 5 seconds)"
            finally:
                os.unlink(temp_file_name)
        else:
            return Response({'detail': f'Execution for language "{language}" not supported'}, status=400)

        # Return the execution result
        return Response({
            'output': result,
            'error': error if error else None
        })

    except Exception as e:
        return Response({'detail': str(e)}, status=500)

# Rest of the file remains unchanged
@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        user = User.objects.create_user(
            username=serializer.validated_data['username'],
            email=serializer.validated_data['email'],
            password=request.data['password']
        )
        # Create token for the user
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'user': UserSerializer(user).data,
            'token': token.key
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_current_user(request):
    """Get the currently authenticated user's information."""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)

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
        # Filter by authenticated user
        queryset = File.objects.filter(project__owner=self.request.user)

        # Filter by project_id when provided in query parameters
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        return queryset

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
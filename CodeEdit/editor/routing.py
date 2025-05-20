from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/code/(?P<session_id>\w+)/$', consumers.CodeConsumer.as_asgi()),
]
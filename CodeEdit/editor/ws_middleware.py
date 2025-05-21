from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from rest_framework.authtoken.models import Token
import logging

logger = logging.getLogger(__name__)

@database_sync_to_async
def get_user(token_key):
    try:
        token = Token.objects.get(key=token_key)
        return token.user
    except Token.DoesNotExist:
        return AnonymousUser()
    except Exception as e:
        logger.error(f"Token authentication error: {e}")
        return AnonymousUser()

class TokenAuthMiddleware(BaseMiddleware):
    """
    Custom middleware that takes a token from the query string and authenticates via Django Rest Framework authtoken.
    """

    async def __call__(self, scope, receive, send):
        # Close old database connections to prevent usage of timed out connections
        close_old_connections()

        # Get the token from query string
        query_string = scope.get('query_string', b'').decode()
        if query_string:
            query_params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            token = query_params.get('token')

            if token:
                scope['user'] = await get_user(token)
                logger.info(f"WebSocket authenticated as {scope['user']} using token")
            else:
                scope['user'] = AnonymousUser()
                logger.info("WebSocket user not authenticated (no token provided)")
        else:
            scope['user'] = AnonymousUser()
            logger.info("WebSocket user not authenticated (no query string)")

        return await super().__call__(scope, receive, send)
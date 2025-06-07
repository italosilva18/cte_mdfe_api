from django.http import JsonResponse
from django.urls import resolve
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.contrib.auth import get_user

class APIAuthenticationMiddleware:
    """
    Middleware para garantir que todas as requisições API sejam autenticadas
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Verificar se é uma requisição para API
        if request.path.startswith('/api/'):
            # Excluir algumas rotas públicas se necessário
            public_api_paths = [
                '/api/token/',  # Se ainda estiver sendo usado
                '/api/swagger/',
                '/api/redoc/',
            ]
            
            if not any(request.path.startswith(path) for path in public_api_paths):
                # Verificar se o usuário está autenticado
                if not request.user.is_authenticated:
                    return JsonResponse({
                        'error': 'Authentication required',
                        'detail': 'You must be logged in to access this API endpoint.',
                        'login_url': '/login/'
                    }, status=401)

        response = self.get_response(request)
        return response

class SessionSecurityMiddleware:
    """
    Middleware para adicionar segurança extra às sessões
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Adicionar cabeçalhos de segurança para páginas autenticadas
        response = self.get_response(request)
        
        if request.user.is_authenticated:
            # Adicionar cabeçalhos de segurança
            response['X-Frame-Options'] = 'DENY'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
            
        return response
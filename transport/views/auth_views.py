# transport/views/auth_views.py

# Imports do Django
from django.contrib.auth.models import User

# Imports do Django REST Framework
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser

# Imports locais (serializers)
# Usamos '..' para indicar que serializers está um nível acima (na pasta 'transport')
from ..serializers.user_serializers import UserSerializer, UserUpdateSerializer

# ===============================================================
# ==> USUÁRIOS e AUTENTICAÇÃO
# ===============================================================

class CurrentUserAPIView(APIView):
    """API para obter e atualizar os dados do usuário autenticado."""
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        """Retorna os dados do usuário autenticado."""
        user = request.user
        data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'last_login': user.last_login,
            'date_joined': user.date_joined
        }
        return Response(data)

    def patch(self, request, format=None):
        """Atualiza os dados do usuário autenticado."""
        user = request.user
        # Usar get_serializer para consistência, embora funcione diretamente aqui
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserViewSet(viewsets.ModelViewSet):
    """API para administração de usuários (somente admin)."""
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer # Serializer padrão para list/retrieve/create/destroy
    permission_classes = [IsAuthenticated, IsAdminUser] # Permissões padrão para o ViewSet

    def get_serializer_class(self):
        """Define qual serializer usar dependendo da ação."""
        # Para a ação 'me' e métodos PUT/PATCH, usa o serializer de atualização
        if self.action == 'me' and self.request.method in ['PUT', 'PATCH']:
            return UserUpdateSerializer
        # Para todas as outras ações (list, retrieve, create, etc.), usa o padrão
        return UserSerializer

    @action(detail=False, methods=['get', 'put', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Endpoint para o usuário logado gerenciar seu próprio perfil."""
        user = request.user # Pega o usuário da requisição autenticada

        if request.method == 'GET':
            # Usa o serializer definido em get_serializer_class (será UserSerializer)
            serializer = self.get_serializer(user)
            return Response(serializer.data)
        elif request.method in ['PUT', 'PATCH']:
            # Usa o serializer definido em get_serializer_class (será UserUpdateSerializer)
            # partial=True é automático para PATCH, mas explícito para clareza
            partial = (request.method == 'PATCH')
            serializer = self.get_serializer(user, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True) # Levanta erro se inválido
            serializer.save()
            return Response(serializer.data)
        # Para outros métodos, DRF normalmente retornaria 405 automaticamente,
        # mas explicitamos para evitar comportamentos inesperados.
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)


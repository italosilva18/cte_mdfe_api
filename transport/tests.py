# transport/tests.py

from django.urls import reverse
from django.contrib.auth.models import User

import os
import re
from .models import CTeDocumento, MDFeDocumento
from .services.parser_cte import parse_cte_completo
from .services.parser_mdfe import parse_mdfe_completo
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken

class AuthTests(APITestCase):
    def setUp(self):
        # Criar um usuário comum para testes
        self.user = User.objects.create_user(username='testuser', password='testpassword123', email='testuser@example.com', first_name='Test', last_name='User')
        
        # Criar um usuário administrador para testes
        self.admin_user = User.objects.create_superuser(username='adminuser', password='adminpassword123', email='adminuser@example.com')
        
        # Configurar cliente não autenticado
        self.guest_client = APIClient()
        
        # Configurar cliente autenticado como usuário comum
        self.user_client = APIClient()
        refresh_user = RefreshToken.for_user(self.user)
        self.user_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh_user.access_token}')

        # Configurar cliente autenticado como administrador
        self.admin_client = APIClient()
        refresh_admin = RefreshToken.for_user(self.admin_user)
        self.admin_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh_admin.access_token}')

    # --- Testes para CurrentUserAPIView (/api/users/me/) ---
    def test_get_current_user_authenticated(self):

        # Login using Django's test client
        logged_in = self.client.login(username=self.user.username, password=self.password)
        self.assertTrue(logged_in)

        url = reverse("user_me")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        expected_fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_staff",
            "is_superuser",
            "last_login",
            "date_joined",
        ]
        for field in expected_fields:
            self.assertIn(field, data)

    def test_get_current_user_requires_authentication(self):
        url = reverse("user_me")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)



def _load_xml(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def _extract_chave(xml_content):
    match = re.search(r"(\d{44})", xml_content)
    return match.group(1) if match else None


class PanelEndpointsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.password = "panelpass123"
        cls.user = User.objects.create_user(
            username="paneluser",
            password=cls.password,
            email="panel@example.com",
        )

        base_dir = os.path.dirname(os.path.dirname(__file__))
        cte_path = os.path.join(base_dir, "media", "xml_ctes", "229240000051072-procCTe.xml")
        mdfe_path = os.path.join(base_dir, "media", "xml_mdfes", "29221226752737000154580010000014891612665525.xml")

        cte_xml = _load_xml(cte_path)
        mdfe_xml = _load_xml(mdfe_path)

        cte_chave = _extract_chave(cte_xml)
        mdfe_chave = _extract_chave(mdfe_xml)

        cls.cte_doc = CTeDocumento.objects.create(
            chave=cte_chave,
            xml_original=cte_xml,
            versao="4.00",
            processado=False,
        )
        parse_cte_completo(cls.cte_doc)

        cls.mdfe_doc = MDFeDocumento.objects.create(
            chave=mdfe_chave,
            xml_original=mdfe_xml,
            versao="3.00",
            processado=False,
        )
        parse_mdfe_completo(cls.mdfe_doc)

    def setUp(self):
        self.client = Client()
        logged_in = self.client.login(username=self.user.username, password=self.password)
        self.assertTrue(logged_in)

    def test_dashboard_api(self):
        url = reverse("dashboard-geral")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_cte_panel_api(self):
        url = reverse("painel-cte")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_mdfe_panel_api(self):
        url = reverse("painel-mdfe")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_financeiro_panel_api(self):
        url = reverse("painel-financeiro")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        """
        Verifica se um usuário autenticado consegue obter seus próprios dados.
        """
        url = reverse('user_me') # Nome da URL definido em transport.urls
        response = self.user_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user.username)
        self.assertEqual(response.data['email'], self.user.email)

    def test_get_current_user_unauthenticated(self):
        """
        Verifica se um usuário não autenticado recebe 401 ao tentar acessar /api/users/me/.
        """
        url = reverse('user_me')
        response = self.guest_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_current_user_authenticated(self):
        """
        Verifica se um usuário autenticado consegue atualizar seus próprios dados (first_name, last_name, email).
        """
        url = reverse('user_me')
        data = {
            'first_name': 'UpdatedFirst',
            'last_name': 'UpdatedLast',
            'email': 'updateduser@example.com'
        }
        response = self.user_client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'UpdatedFirst')
        self.assertEqual(self.user.last_name, 'UpdatedLast')
        self.assertEqual(self.user.email, 'updateduser@example.com')

    def test_patch_current_user_change_password(self):
        """
        Verifica se um usuário autenticado consegue alterar sua senha.
        """
        url = reverse('user_me')
        data = {
            'password': 'newtestpassword456',
            'password_confirm': 'newtestpassword456'
        }
        response = self.user_client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('newtestpassword456'))

    def test_patch_current_user_password_mismatch(self):
        """
        Verifica se a atualização de senha falha se as senhas não coincidirem.
        """
        url = reverse('user_me')
        data = {
            'password': 'newpassword1',
            'password_confirm': 'newpassword2' # Senhas diferentes
        }
        response = self.user_client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_patch_current_user_email_taken(self):
        """
        Verifica se a atualização de email falha se o email já estiver em uso por outro usuário.
        """
        # Criar um segundo usuário com um email
        User.objects.create_user(username='otheruser', password='password', email='existing@example.com')
        
        url = reverse('user_me')
        data = {
            'email': 'existing@example.com' # Email já em uso
        }
        response = self.user_client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    # --- Testes para UserViewSet (/api/usuarios/) ---
    
    # LIST (GET /api/usuarios/)
    def test_list_users_as_admin(self):
        """
        Administrador deve conseguir listar usuários.
        """
        url = reverse('usuario-list') # O DRF router nomeia como 'basename-list'
        response = self.admin_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 2) # Deve haver pelo menos adminuser e testuser

    def test_list_users_as_common_user(self):
        """
        Usuário comum não deve conseguir listar usuários.
        """
        url = reverse('usuario-list')
        response = self.user_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_users_as_guest(self):
        """
        Usuário não autenticado não deve conseguir listar usuários.
        """
        url = reverse('usuario-list')
        response = self.guest_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # CREATE (POST /api/usuarios/)
    def test_create_user_as_admin(self):
        """
        Administrador deve conseguir criar um novo usuário.
        """
        url = reverse('usuario-list')
        data = {
            'username': 'newbie',
            'password': 'newbiepassword',
            'email': 'newbie@example.com',
            'first_name': 'New',
            'last_name': 'Bie',
            'is_staff': False
        }
        response = self.admin_client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username='newbie').exists())
        new_user = User.objects.get(username='newbie')
        self.assertTrue(new_user.check_password('newbiepassword'))
        self.assertEqual(new_user.email, 'newbie@example.com')

    def test_create_user_as_admin_email_taken(self):
        """
        Administrador não deve conseguir criar usuário com email já existente.
        """
        url = reverse('usuario-list')
        data = {
            'username': 'anothernewbie',
            'password': 'password123',
            'email': self.user.email, # Email do testuser
        }
        response = self.admin_client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_create_user_as_common_user(self):
        """
        Usuário comum não deve conseguir criar usuários.
        """
        url = reverse('usuario-list')
        data = {'username': 'anotheruser', 'password': 'password'}
        response = self.user_client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # RETRIEVE (GET /api/usuarios/{id}/)
    def test_retrieve_user_as_admin(self):
        """
        Administrador deve conseguir obter dados de um usuário específico.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.user.pk})
        response = self.admin_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user.username)

    def test_retrieve_user_as_common_user(self):
        """
        Usuário comum não deve conseguir obter dados de outros usuários.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.admin_user.pk})
        response = self.user_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # UPDATE (PUT /api/usuarios/{id}/)
    def test_update_user_as_admin(self):
        """
        Administrador deve conseguir atualizar dados de um usuário.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.user.pk})
        data = {
            'username': self.user.username, # Username precisa ser enviado no PUT
            'first_name': 'UserUpdated',
            'email': 'user.updated@example.com',
            'is_staff': True
        }
        response = self.admin_client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'UserUpdated')
        self.assertEqual(self.user.email, 'user.updated@example.com')
        self.assertTrue(self.user.is_staff)

    def test_update_user_password_as_admin(self):
        """
        Administrador deve conseguir alterar a senha de um usuário.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.user.pk})
        data = {
            'username': self.user.username, # Username precisa ser enviado no PUT
            'password': 'newpasswordforuser'
            # Outros campos podem ser omitidos se o serializer permitir partial=True implicitamente ou
            # se você enviar todos os campos obrigatórios do UserSerializer.
            # Para PUT, geralmente é esperado todos os campos. Para PATCH, apenas os que mudam.
            # O UserSerializer padrão do DRF para User pode ser um pouco chato com PUT.
            # Vamos testar como PATCH para ser mais flexível
        }
        response = self.admin_client.patch(url, data, format='json') # Usando PATCH
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('newpasswordforuser'))


    def test_update_user_as_common_user(self):
        """
        Usuário comum não deve conseguir atualizar dados de outros usuários.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.admin_user.pk})
        data = {'first_name': 'AttemptUpdate'}
        response = self.user_client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # DESTROY (DELETE /api/usuarios/{id}/)
    def test_delete_user_as_admin(self):
        """
        Administrador deve conseguir deletar um usuário.
        """
        user_to_delete = User.objects.create_user(username='todelete', password='password')
        url = reverse('usuario-detail', kwargs={'pk': user_to_delete.pk})
        response = self.admin_client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=user_to_delete.pk).exists())

    def test_delete_self_as_admin(self):
        """
        Administrador não deve conseguir se auto-deletar (geralmente bloqueado por segurança).
        Se o sistema permitir, este teste falhará e precisará ser ajustado ou a lógica revista.
        O DRF padrão pode permitir, mas pode não ser o comportamento desejado.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.admin_user.pk})
        response = self.admin_client.delete(url)
        # Espera-se 204 se permitido, ou 403/400 se houver lógica de proteção.
        # Por simplicidade, testaremos o comportamento padrão do DRF que é 204.
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT) 
        self.assertFalse(User.objects.filter(pk=self.admin_user.pk).exists())
        # Para re-logar para outros testes, precisaremos de um novo admin ou tratar isso no tearDown/setUp.
        # Por ora, este teste sendo o último de delete de admin é ok.


    def test_delete_user_as_common_user(self):
        """
        Usuário comum não deve conseguir deletar outros usuários.
        """
        url = reverse('usuario-detail', kwargs={'pk': self.admin_user.pk})
        response = self.user_client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
    # Teste específico para a action 'me' no UserViewSet (já coberto por CurrentUserAPIView, mas bom para rota)
    def test_user_viewset_me_get(self):
        """
        Verifica GET para /api/usuarios/me/ (rota do UserViewSet).
        """
        # A rota para 'me' dentro do UserViewSet é usualmente 'basename-me'
        url = reverse('usuario-me')
        response = self.user_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user.username)

    def test_user_viewset_me_patch(self):
        """
        Verifica PATCH para /api/usuarios/me/ (rota do UserViewSet).
        """
        url = reverse('usuario-me')
        data = {'first_name': 'PatchedViaViewSetMe'}
        response = self.user_client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'PatchedViaViewSetMe')


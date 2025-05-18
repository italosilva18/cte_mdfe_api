from django.test import Client, TestCase
from django.urls import reverse
from django.contrib.auth.models import User
import os
import re
from .models import CTeDocumento, MDFeDocumento
from .services.parser_cte import parse_cte_completo
from .services.parser_mdfe import parse_mdfe_completo



class CurrentUserAPIViewTests(TestCase):
    def setUp(self):
        self.password = "testpass123"
        self.user = User.objects.create_user(
            username="testuser",
            password=self.password,
            email="user@example.com",
            first_name="Test",
            last_name="User",
        )
        self.client = Client()

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

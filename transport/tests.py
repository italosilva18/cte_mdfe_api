from django.test import Client, TestCase
from django.urls import reverse
from django.contrib.auth.models import User


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

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.routes import auth


class FakeSession:
    def __init__(self, user=None):
        self.user = user

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def scalar(self, statement):
        sql = str(statement)
        if "FROM users" in sql:
            return self.user
        raise AssertionError(f"Unexpected scalar SQL: {sql}")


class AuthRouteTests(unittest.IsolatedAsyncioTestCase):
    def parse_response(self, response):
        return json.loads(response.body)

    async def test_login_returns_token_for_valid_credentials(self):
        user = SimpleNamespace(id=4, role="ADMIN", password_hash="hash")
        request = SimpleNamespace(json={"email": "admin@example.com", "password": "secret"})

        with patch("app.routes.auth.SessionLocal", return_value=FakeSession(user=user)):
            with patch("app.routes.auth.verify_password", return_value=True):
                with patch("app.routes.auth.create_token", return_value="jwt-token"):
                    response = await auth.login(request)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["token"], "jwt-token")
        self.assertEqual(payload["role"], "ADMIN")
        self.assertEqual(payload["user_id"], 4)

    async def test_login_rejects_invalid_credentials(self):
        request = SimpleNamespace(json={"email": "missing@example.com", "password": "bad"})

        with patch("app.routes.auth.SessionLocal", return_value=FakeSession(user=None)):
            response = await auth.login(request)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 401)
        self.assertEqual(payload["error"], "invalid_credentials")

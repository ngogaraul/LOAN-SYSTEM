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
    def setUp(self):
        auth._LOGIN_ATTEMPTS.clear()

    def parse_response(self, response):
        return json.loads(response.body)

    async def test_login_returns_token_for_valid_credentials(self):
        user = SimpleNamespace(id=4, role="ADMIN", password_hash="hash")
        request = SimpleNamespace(
            json={"email": "admin@example.com", "password": "secret"},
            headers={},
            remote_addr="127.0.0.1",
        )

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
        request = SimpleNamespace(
            json={"email": "missing@example.com", "password": "bad"},
            headers={},
            remote_addr="127.0.0.1",
        )

        with patch("app.routes.auth.SessionLocal", return_value=FakeSession(user=None)):
            response = await auth.login(request)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 401)
        self.assertEqual(payload["error"], "invalid_credentials")

    async def test_login_rate_limits_after_repeated_failures(self):
        request = SimpleNamespace(
            json={"email": "missing@example.com", "password": "bad"},
            headers={},
            remote_addr="127.0.0.1",
        )

        with patch("app.routes.auth.SessionLocal", return_value=FakeSession(user=None)):
            for _ in range(auth.LOGIN_RATE_LIMIT_MAX_ATTEMPTS):
                response = await auth.login(request)
                self.assertEqual(response.status, 401)

            limited_response = await auth.login(request)

        payload = self.parse_response(limited_response)
        self.assertEqual(limited_response.status, 429)
        self.assertEqual(payload["error"], "too_many_attempts")

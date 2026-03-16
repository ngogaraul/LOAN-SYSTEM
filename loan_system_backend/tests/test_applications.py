import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.routes import applications


class ScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return ScalarResult(self._values)

    def all(self):
        return list(self._values)


class FakeSession:
    def __init__(self, *, get_map=None, execute_map=None, scalar_map=None):
        self.get_map = get_map or {}
        self.execute_map = execute_map or {}
        self.scalar_map = scalar_map or {}
        self.added = []
        self.deleted = []
        self.commit_count = 0
        self.refreshed = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, model, key):
        return self.get_map.get((model.__name__, key))

    async def execute(self, statement):
        sql = str(statement)
        for key, value in self.execute_map.items():
            if key in sql:
                return ExecuteResult(value)
        raise AssertionError(f"Unexpected execute SQL: {sql}")

    async def scalar(self, statement):
        sql = str(statement)
        for key, value in self.scalar_map.items():
            if key in sql:
                return value
        return None

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = 101
        self.refreshed.append(obj)


def make_request(*, json_body=None, role="ANALYST"):
  return SimpleNamespace(
      json=json_body or {},
      args={},
      headers={"Authorization": "Bearer test-token"},
      ctx=SimpleNamespace(),
      role=role,
  )


class ApplicationsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.decode_token = patch(
            "app.auth_guard.decode_token",
            return_value={"sub": "5", "role": "ANALYST"},
        )
        self.decode_token.start()
        self.addCleanup(self.decode_token.stop)

    def parse_response(self, response):
        return json.loads(response.body)

    def test_aggregate_creditlines_sums_and_modes(self):
        rows = [
            SimpleNamespace(
                outstanding=100,
                payment_plan=20,
                remaining_period=6,
                periodicity=1,
                class_value=2,
                compulsory_saving=30,
                voluntary_saving=10,
                salary=50,
                duration=12,
                start_date="2025-01-01",
            ),
            SimpleNamespace(
                outstanding=50,
                payment_plan=10,
                remaining_period=9,
                periodicity=1,
                class_value=3,
                compulsory_saving=5,
                voluntary_saving=2,
                salary=80,
                duration=10,
                start_date="2024-12-01",
            ),
        ]

        result = applications.aggregate_creditlines(rows)

        self.assertEqual(result["outstanding"], 150)
        self.assertEqual(result["payment_plan"], 30)
        self.assertEqual(result["remaining_period"], 9)
        self.assertEqual(result["periodicity"], 1)
        self.assertEqual(result["compulsory_saving"], 35)
        self.assertEqual(result["salary"], 80)
        self.assertEqual(result["duration"], 12)
        self.assertEqual(result["start_date"], "2024-12-01")

    def test_resolved_payment_plan_prefers_application_value(self):
        app_ = SimpleNamespace(payment_plan=700)
        linked = SimpleNamespace(payment_plan=500)
        fin = SimpleNamespace(payment_plan=300)
        creditlines = [SimpleNamespace(payment_plan=200)]

        result = applications._resolved_payment_plan(app_, linked, fin, creditlines)

        self.assertEqual(result, 700)

    async def test_create_application_uses_available_creditline_and_saves_payment_plan(self):
        client = SimpleNamespace(id=7, account="5226274")
        creditline = SimpleNamespace(id=1, client_id=7, creditline="5226274-02-004", is_available=True)
        session = FakeSession(
            get_map={("Client", 7): client},
            execute_map={
                "FROM creditline_financials": [creditline],
                "SELECT loan_applications.creditline": [],
            },
            scalar_map={
                "FROM loan_applications ": None,
            },
        )

        request = make_request(
            json_body={
                "client_id": 7,
                "amount_requested": 25000000,
                "payment_plan": 5000000,
                "purpose": "buy car",
                "term_requested": 5,
            }
        )

        with patch("app.routes.applications.SessionLocal", return_value=session):
            response = await applications.create_application(request)

        payload = self.parse_response(response)

        self.assertEqual(response.status, 200)
        self.assertEqual(payload["creditline"], "5226274-02-004")
        self.assertEqual(payload["payment_plan"], 5000000.0)
        created_app = next(obj for obj in session.added if obj.__class__.__name__ == "LoanApplication")
        self.assertEqual(created_app.payment_plan, 5000000.0)
        self.assertEqual(created_app.term_requested, 5)
        self.assertEqual(session.commit_count, 1)

    async def test_get_application_returns_resolved_payment_plan(self):
        app_ = SimpleNamespace(
            id=11,
            client_id=7,
            creditline="5226274-02-004",
            amount_requested=2000000,
            payment_plan=45000,
            purpose="stock",
            term_requested=45,
            status="SUBMITTED",
            submitted_at="2026-03-15T10:00:00",
        )
        session = FakeSession(
            get_map={("LoanApplication", 11): app_},
            execute_map={"FROM creditline_financials": []},
            scalar_map={
                "FROM creditline_financials": None,
                "FROM client_financials": None,
            },
        )

        with patch("app.routes.applications.SessionLocal", return_value=session):
            response = await applications.get_application(make_request(), 11)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["payment_plan"], 45000)

    async def test_create_application_with_new_creditline_persists_interest_rate(self):
        client = SimpleNamespace(id=8, account="90001")
        session = FakeSession(
            get_map={("Client", 8): client},
            execute_map={
                "FROM creditline_financials": [],
                "SELECT loan_applications.creditline": [],
            },
            scalar_map={
                "FROM loan_applications ": None,
                "SELECT loan_applications.id": None,
            },
        )

        request = make_request(
            json_body={
                "client_id": 8,
                "creditline_mode": "new",
                "creditline": "90001-NEW-01",
                "amount_requested": 1000000,
                "payment_plan": 200000,
                "interest_rate": 18,
                "purpose": "school fees",
                "term_requested": 5,
            }
        )

        with patch("app.routes.applications.SessionLocal", return_value=session):
            response = await applications.create_application(request)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["interest_rate"], 18)

        created_creditline = next(obj for obj in session.added if obj.__class__.__name__ == "CreditlineFinancial")
        self.assertEqual(created_creditline.interest_rate, 18)

    async def test_update_application_updates_payment_plan_and_term(self):
        app_ = SimpleNamespace(
            id=12,
            amount_requested=1000,
            payment_plan=100,
            purpose="old",
            term_requested=10,
            status="SUBMITTED",
            creditline="CL-1",
        )
        session = FakeSession(get_map={("LoanApplication", 12): app_})

        request = make_request(
            json_body={
                "amount_requested": 2000,
                "payment_plan": 250,
                "purpose": "new purpose",
                "term_requested": 8,
            }
        )

        with patch("app.routes.applications.SessionLocal", return_value=session):
            response = await applications.update_application(request, 12)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["message"], "application updated")
        self.assertEqual(app_.amount_requested, 2000.0)
        self.assertEqual(app_.payment_plan, 250.0)
        self.assertEqual(app_.purpose, "new purpose")
        self.assertEqual(app_.term_requested, 8)
        self.assertEqual(session.commit_count, 1)

    async def test_delete_application_removes_empty_generated_creditline(self):
        app_ = SimpleNamespace(
            id=13,
            client_id=7,
            creditline="AUTO-5226274-01",
            status="SUBMITTED",
        )
        linked_creditline = SimpleNamespace(
            id=21,
            client_id=7,
            creditline="AUTO-5226274-01",
            outstanding=0,
            principal_arrears=0,
            interest_arrears=0,
            payment_plan=0,
            interest_rate=18,
            days_in_arrears=0,
            duration=0,
            remaining_period=0,
            periodicity=0,
            class_value=0,
            compulsory_saving=0,
            voluntary_saving=0,
            salary=0,
            start_date="",
        )
        session = FakeSession(
            get_map={("LoanApplication", 13): app_},
            execute_map={
                "FROM credit_scores": [],
                "FROM decisions": [],
            },
            scalar_map={
                "FROM creditline_financials": linked_creditline,
                "SELECT loan_applications.id": None,
            },
        )

        with patch("app.routes.applications.SessionLocal", return_value=session):
            response = await applications.delete_application(make_request(), 13)

        payload = self.parse_response(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["message"], "application deleted")
        self.assertIn(app_, session.deleted)
        self.assertIn(linked_creditline, session.deleted)

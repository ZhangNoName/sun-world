import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/api"))
from src.core.auth import Principal, PublicReadPolicy, TargetContext, AuthorizationDenied
from src.core.auth.admin_shadow import admin_baseline, compare_admin_policy, observe_admin_policy


class AdminPolicyShadowTests(unittest.TestCase):
    def test_baseline_is_explicit_and_never_grants_agent_writes(self):
        admin = Principal(kind="user", user_id=1, roles=("admin",))
        self.assertTrue(admin_baseline(admin, "DELETE", "/blogs/{blog_id}"))
        for method, path in [("PATCH", "/blogs/{blog_id}"), ("POST", "/admin/new"),
                             ("POST", "/ai/v1/blog-qa/runs/stream")]:
            self.assertFalse(admin_baseline(admin, method, path))
        for principal in [Principal(), Principal(kind="service", roles=("admin",)),
                          Principal(kind="user", user_id=True, roles=("admin",)),
                          Principal(kind="user", user_id=1, roles=("normal",))]:
            self.assertFalse(admin_baseline(principal, "GET", "/admin/logs"))
        with self.assertRaises(AuthorizationDenied):
            PublicReadPolicy().require(admin, "blog.article.publish", TargetContext())

    def test_comparison_reports_both_directions_and_policy_error(self):
        principal = Principal(kind="user", user_id=1, roles=("admin",))
        for legacy, candidate, event in [
            (True, False, "admin_policy_shadow_candidate_deny"),
            (False, True, "admin_policy_shadow_candidate_allow"),
            (True, True, None), (False, False, None),
        ]:
            result = compare_admin_policy(principal, "GET", "/admin/logs",
                legacy_allowed=legacy, candidate=lambda *_: candidate)
            self.assertEqual(result.event, event)
            self.assertEqual(result.legacy_allowed, legacy)
        for candidate in [Mock(side_effect=RuntimeError("private secret")), lambda *_: "allow"]:
            result = compare_admin_policy(principal, "GET", "/admin/logs", legacy_allowed=True, candidate=candidate)
            self.assertEqual(result.event, "admin_policy_shadow_error")
            self.assertIsNone(result.candidate_allowed)

    def test_observer_never_records_account_or_unreviewed_paths(self):
        record = Mock()
        user = {"id": 123, "roles": [{"code": "admin"}], "password": "secret"}
        observe_admin_policy(user, "GET", "/unreviewed/private?token=secret", True, record)
        record.assert_called_once_with("admin_policy_shadow_unmapped", severity="warning",
                                       method="UNKNOWN", route="<unmapped>")
        observe_admin_policy(user, "GET", "/unreviewed", True, Mock(side_effect=OSError("secret")))

    def test_dependency_observation_cannot_change_legacy_authorization(self):
        from src.routers.auth.auth import get_auth_manager, get_current_user, require_admin
        app = FastAPI()
        @app.get("/admin/logs", dependencies=[Depends(require_admin)])
        def guarded():
            return {"ok": True}
        client = TestClient(app)
        for roles, expected in [([{"code": " ADMIN "}], 200), ([{"code": "normal"}], 403)]:
            app.dependency_overrides[get_current_user] = lambda: {"id": 1, "roles": roles}
            with patch("src.core.auth.admin_shadow.compare_admin_policy", side_effect=RuntimeError("secret")):
                self.assertEqual(client.get("/admin/logs").status_code, expected)
        app.dependency_overrides.pop(get_current_user)
        app.dependency_overrides[get_auth_manager] = lambda: Mock()
        self.assertEqual(client.get("/admin/logs").status_code, 401)

    def test_http_mismatch_is_recorded_but_does_not_grant_or_revoke(self):
        from src.routers.auth.auth import get_current_user, require_admin
        app = FastAPI()
        @app.get("/admin/logs", dependencies=[Depends(require_admin)])
        def guarded():
            return {"ok": True}
        # Legacy accepts role-only objects; the proposed baseline also needs a
        # stable user ID. Observe this difference without changing legacy access.
        app.dependency_overrides[get_current_user] = lambda: {"roles": [{"code": "admin"}]}
        with patch("src.routers.auth.auth.audit_log.record") as record:
            self.assertEqual(TestClient(app).get("/admin/logs?secret=omitted").status_code, 200)
            record.assert_called_once_with("admin_policy_shadow_candidate_deny", severity="warning",
                                           method="GET", route="/admin/logs")
        app.dependency_overrides[get_current_user] = lambda: {"id": 1, "roles": [],
            "resources": [{"code": "admin", "path": "/admin/logs"}]}
        with patch("src.routers.auth.auth.audit_log.record", side_effect=OSError("unavailable")):
            self.assertEqual(TestClient(app).get("/admin/logs").status_code, 403)

    def test_inventory_includes_inherited_guards_and_effective_prefixes(self):
        spec = importlib.util.spec_from_file_location("admin_check", ROOT / "scripts/check-admin-policy.py")
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        def guard():
            return True
        app = FastAPI()
        router = APIRouter(dependencies=[Depends(guard)])
        @router.delete("/{item_id}")
        def remove(item_id: int):
            return True
        app.include_router(router, prefix="/outer")
        self.assertEqual(check.guarded_operations(app.routes, guard), {("DELETE", "/outer/{item_id}")})

    def test_inventory_rejects_duplicate_guarded_and_unguarded_routes_in_either_order(self):
        spec = importlib.util.spec_from_file_location("admin_check", ROOT / "scripts/check-admin-policy.py")
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        def guard():
            return True
        def handler():
            return {"ok": True}
        for guards in [(False, True), (True, False), (True, True)]:
            with self.subTest(guards=guards):
                app = FastAPI()
                for guarded in guards:
                    app.add_api_route("/admin/logs", handler, methods=["GET"],
                                      dependencies=[Depends(guard)] if guarded else [])
                with self.assertRaisesRegex(ValueError, "Duplicate admin operation"):
                    check.guarded_operations(app.routes, guard)

    def test_inventory_rejects_earlier_public_dynamic_route_shadowing_admin(self):
        spec = importlib.util.spec_from_file_location("admin_check", ROOT / "scripts/check-admin-policy.py")
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        def guard():
            return True
        def handler():
            return {"ok": True}
        for public, private in [("/admin/{page}", "/admin/logs"),
                                ("/admin/{path:path}", "/admin/dictionaries/types"),
                                ("/admin/{id:int}", "/admin/{item_id}")]:
            with self.subTest(public=public):
                app = FastAPI()
                app.add_api_route(public, handler, methods=["GET"])
                app.add_api_route(private, handler, methods=["GET"], dependencies=[Depends(guard)])
                with self.assertRaisesRegex(ValueError, "shadows admin operation"):
                    check.guarded_operations(app.routes, guard)
        app = FastAPI()
        app.add_api_route("/admin/logs", handler, methods=["GET"], dependencies=[Depends(guard)])
        app.add_api_route("/admin/{page}", handler, methods=["GET"])
        self.assertEqual(check.guarded_operations(app.routes, guard), {("GET", "/admin/logs")})

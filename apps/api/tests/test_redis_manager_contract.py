import sys
import unittest
from pathlib import Path
from unittest.mock import patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class RedisClientStub:
    def __init__(self):
        self.calls = []

    def hdel(self, *args):
        self.calls.append(("hdel", args))
        return 1

    def get(self, *args):
        self.calls.append(("get", args))
        return "value"

    def setex(self, *args):
        self.calls.append(("setex", args))
        return True

    def set(self, *args, **kwargs):
        self.calls.append(("set", args, kwargs))
        return True

    def getdel(self, *args):
        self.calls.append(("getdel", args))
        return "consumed"

    def eval(self, *args):
        self.calls.append(("eval", args))
        return 1

    def zrem(self, *args):
        self.calls.append(("zrem", args))
        return 1


class RedisManagerContractTests(unittest.TestCase):
    def test_client_configures_connect_and_established_socket_timeouts(self):
        from src.database.redis.redis_manage import RedisManager

        with patch("src.database.redis.redis_manage.Redis") as redis_client:
            redis_client.return_value.ping.return_value = True
            manager = RedisManager(
                auth="secret",
                ip="127.0.0.1",
                port=6379,
                db=0,
                key_prefix="sun-world",
                timeout=1.5,
            )

        kwargs = redis_client.call_args.kwargs
        self.assertEqual(kwargs["socket_connect_timeout"], 1.5)
        self.assertEqual(kwargs["socket_timeout"], 1.5)
        self.assertTrue(kwargs["socket_keepalive"])
        self.assertEqual(kwargs["health_check_interval"], 30)
        self.assertFalse(kwargs["retry_on_timeout"])

    def setUp(self):
        from src.database.redis.redis_manage import RedisManager

        self.client = RedisClientStub()
        self.manager = object.__new__(RedisManager)
        self.manager.r = self.client
        self.manager.key_prefix = "sun-world"
        self.manager._maybe_reconnect = lambda: None

    def test_hash_field_delete_uses_hdel_and_the_prefixed_hash_key(self):
        self.assertEqual(self.manager.hdelete("session", "device-1"), 1)
        self.assertEqual(
            self.client.calls,
            [("hdel", ("sun-world:session", "device-1"))],
        )

    def test_string_and_one_time_state_operations_keep_prefixing_consistent(self):
        self.assertEqual(self.manager.get("oauth:state"), "value")
        self.assertTrue(self.manager.setex("oauth:state", 300, "payload"))
        self.assertTrue(
            self.manager.set_if_absent("oauth:cooldown", "1", ttl=60)
        )
        self.assertEqual(self.manager.getdel("oauth:state"), "consumed")
        self.assertEqual(
            self.client.calls,
            [
                ("get", ("sun-world:oauth:state",)),
                ("setex", ("sun-world:oauth:state", 300, "payload")),
                (
                    "set",
                    ("sun-world:oauth:cooldown", "1"),
                    {"ex": 60, "nx": True},
                ),
                ("getdel", ("sun-world:oauth:state",)),
            ],
        )

    def test_session_rotation_is_one_atomic_prefixed_redis_operation(self):
        result = self.manager.rotate_session_tokens(
            user_id="7",
            device_id="browser-1",
            expected_refresh_token="old-refresh",
            new_access_token="new-access",
            new_refresh_token="new-refresh",
            access_ttl=300,
            refresh_ttl=600,
            used_refresh_key="auth:used_refresh:digest",
            session_family_id="family-1",
            revoked_session_key="auth:revoked_session:family-1",
        )

        self.assertEqual(result, 1)
        operation, args = self.client.calls[0]
        self.assertEqual(operation, "eval")
        self.assertEqual(args[1], 5)
        self.assertEqual(
            args[2:7],
            (
                "sun-world:user:7:access_tokens",
                "sun-world:user:7:refresh_tokens",
                "sun-world:auth:used_refresh:digest",
                "sun-world:user:7:session_families",
                "sun-world:auth:revoked_session:family-1",
            ),
        )

    def test_session_successor_snapshot_is_one_atomic_prefixed_redis_operation(self):
        self.client.eval = lambda *args: (
            self.client.calls.append(("eval", args))
            or ["new-access", "new-refresh", "family-1"]
        )

        snapshot = self.manager.get_session_token_snapshot(
            user_id="7",
            device_id="browser-1",
        )

        self.assertEqual(
            snapshot,
            ("new-access", "new-refresh", "family-1"),
        )
        operation, args = self.client.calls[0]
        self.assertEqual(operation, "eval")
        self.assertEqual(args[1], 3)
        self.assertEqual(
            args[2:5],
            (
                "sun-world:user:7:access_tokens",
                "sun-world:user:7:refresh_tokens",
                "sun-world:user:7:session_families",
            ),
        )
        self.assertEqual(args[5], "browser-1")

    def test_session_successor_snapshot_fails_closed_when_any_value_is_missing(self):
        self.client.eval = lambda *_args: ["new-access", None, "family-1"]

        self.assertIsNone(
            self.manager.get_session_token_snapshot(
                user_id="7",
                device_id="browser-1",
            )
        )

    def test_fixed_window_rate_limit_is_one_prefixed_redis_operation(self):
        self.client.eval = lambda *args: (
            self.client.calls.append(("eval", args)) or [3, 57]
        )

        allowed, remaining, retry_after = self.manager.consume_fixed_window(
            name="ai:rate:guest:digest",
            limit=3,
            window_seconds=60,
        )

        self.assertTrue(allowed)
        self.assertEqual(remaining, 0)
        self.assertEqual(retry_after, 57)
        self.assertEqual(self.client.calls[0][1][1:3], (1, "sun-world:ai:rate:guest:digest"))

    def test_multi_rate_limit_consumes_all_dimensions_in_one_redis_operation(self):
        self.client.eval = lambda *args: (
            self.client.calls.append(("eval", args)) or [1, 300]
        )

        allowed, retry_after = self.manager.consume_multi_fixed_window(
            [
                ("auth:login:ip:digest", 30, 600),
                ("auth:login:identifier:digest", 10, 600),
            ]
        )

        self.assertTrue(allowed)
        self.assertEqual(retry_after, 300)
        operation, args = self.client.calls[0]
        self.assertEqual(operation, "eval")
        self.assertEqual(args[1], 2)
        self.assertEqual(
            args[2:4],
            (
                "sun-world:auth:login:ip:digest",
                "sun-world:auth:login:identifier:digest",
            ),
        )

    def test_verification_cooldowns_and_quotas_use_one_owned_reservation(self):
        self.client.eval = lambda *args: (
            self.client.calls.append(("eval", args)) or [1, 60]
        )

        allowed, retry_after = self.manager.reserve_rate_limits_with_cooldowns(
            reservation_name="auth:verify:reservation:challenge-1",
            reservation_id="owner-1",
            cooldowns=[
                ("auth:verify:client:client", 10),
                ("auth:verify:target:target", 60),
            ],
            limits=[
                ("auth:verify:quota:ip:client", 10, 3600),
                ("auth:verify:quota:target-day:target", 10, 86_400),
            ],
            reservation_ttl=86_400,
        )

        self.assertTrue(allowed)
        self.assertEqual(retry_after, 60)
        operation, args = self.client.calls[0]
        self.assertEqual(operation, "eval")
        self.assertEqual(args[1], 5)
        self.assertEqual(
            args[2:7],
            (
                "sun-world:auth:verify:reservation:challenge-1",
                "sun-world:auth:verify:client:client",
                "sun-world:auth:verify:target:target",
                "sun-world:auth:verify:quota:ip:client",
                "sun-world:auth:verify:quota:target-day:target",
            ),
        )

        self.client.eval = lambda *args: (
            self.client.calls.append(("eval", args)) or 1
        )
        self.assertTrue(
            self.manager.rollback_rate_limit_reservation(
                reservation_name="auth:verify:reservation:challenge-1",
                reservation_id="owner-1",
                cooldown_names=[
                    "auth:verify:client:client",
                    "auth:verify:target:target",
                ],
                limit_names=[
                    "auth:verify:quota:ip:client",
                    "auth:verify:quota:target-day:target",
                ],
            )
        )

    def test_bounded_lease_uses_an_expiring_sorted_set_and_explicit_release(self):
        self.assertTrue(
            self.manager.acquire_bounded_lease(
                name="ai:run_concurrency",
                member="run-1",
                limit=8,
                ttl=240,
            )
        )
        self.assertEqual(self.client.calls[0][0], "eval")
        self.assertEqual(self.client.calls[0][1][2], "sun-world:ai:run_concurrency")

        self.assertEqual(
            self.manager.release_bounded_lease(
                name="ai:run_concurrency",
                member="run-1",
            ),
            1,
        )
        self.assertEqual(
            self.client.calls[1],
            ("zrem", ("sun-world:ai:run_concurrency", "run-1")),
        )


if __name__ == "__main__":
    unittest.main()

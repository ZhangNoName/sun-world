import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class IdentityRedisPreflightTests(unittest.TestCase):
    def test_version_parser_and_getdel_boundary(self):
        from src.modules.identity.redis_capability_preflight import (
            parse_redis_version,
            supports_getdel,
        )

        self.assertEqual(parse_redis_version("7.0.15"), (7, 0, 15))
        self.assertEqual(parse_redis_version("6.2"), (6, 2, 0))
        self.assertTrue(supports_getdel("6.2.0"))
        self.assertTrue(supports_getdel("7.0.15"))
        self.assertFalse(supports_getdel("6.0.20"))
        self.assertFalse(supports_getdel("unknown"))

    def test_live_preflight_reads_info_without_mutating_keys(self):
        from src.modules.identity import redis_capability_preflight as preflight

        client = MagicMock()
        client.info.return_value = {"redis_version": "7.0.15"}
        config = {
            "redis": {
                "ip": "redis.internal",
                "port": 6379,
                "db": 2,
                "auth": "secret",
            }
        }
        with (
            patch.object(preflight, "load_api_config", return_value=config),
            patch.object(preflight, "Redis", return_value=client) as redis_type,
        ):
            self.assertEqual(preflight.run_preflight(), 0)

        client.info.assert_called_once_with("server")
        client.close.assert_called_once_with()
        self.assertFalse(client.set.called)
        self.assertFalse(client.delete.called)
        self.assertEqual(redis_type.call_args.kwargs["socket_timeout"], 3)

    def test_live_preflight_fails_closed_on_old_or_unavailable_redis(self):
        from src.modules.identity import redis_capability_preflight as preflight

        config = {
            "redis": {
                "ip": "redis.internal",
                "port": 6379,
                "db": 2,
                "auth": "secret",
            }
        }
        old_client = MagicMock()
        old_client.info.return_value = {"redis_version": "6.0.20"}
        with (
            patch.object(preflight, "load_api_config", return_value=config),
            patch.object(preflight, "Redis", return_value=old_client),
        ):
            self.assertEqual(preflight.run_preflight(), 1)

        with patch.object(
            preflight,
            "load_api_config",
            side_effect=RuntimeError("unavailable"),
        ):
            self.assertEqual(preflight.run_preflight(), 1)


if __name__ == "__main__":
    unittest.main()

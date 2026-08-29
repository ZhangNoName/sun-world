import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class MemoryRedis:
    def __init__(self):
        self.values = {}
        self.counts = {}
        self.reservations = {}

    def set_if_absent(self, name, value, ttl):
        if name in self.values:
            return False
        self.values[name] = value
        return True

    def consume_multi_fixed_window(self, limits):
        self.last_limits = limits
        return True, 60

    def reserve_rate_limits_with_cooldowns(
        self,
        *,
        reservation_name,
        reservation_id,
        cooldowns,
        limits,
        reservation_ttl,
    ):
        self.last_limits = limits
        if reservation_name in self.reservations:
            return False, reservation_ttl
        if any(name in self.values for name, _ttl in cooldowns):
            return False, 60
        if any(self.counts.get(name, 0) >= limit for name, limit, _window in limits):
            return False, 60
        for name, _ttl in cooldowns:
            self.values[name] = reservation_id
        for name, _limit, _window in limits:
            self.counts[name] = self.counts.get(name, 0) + 1
        self.reservations[reservation_name] = (
            reservation_id,
            [name for name, _ttl in cooldowns],
            [name for name, _limit, _window in limits],
        )
        return True, 60

    def rollback_rate_limit_reservation(
        self,
        *,
        reservation_name,
        reservation_id,
        cooldown_names,
        limit_names,
    ):
        reservation = self.reservations.get(reservation_name)
        if not reservation or reservation[0] != reservation_id:
            return False
        for name in cooldown_names:
            if self.values.get(name) == reservation_id:
                self.values.pop(name, None)
        for name in limit_names:
            count = self.counts.get(name, 0)
            if count <= 1:
                self.counts.pop(name, None)
            else:
                self.counts[name] = count - 1
        self.reservations.pop(reservation_name, None)
        return True

    def commit_rate_limit_reservation(self, *, reservation_name, reservation_id):
        reservation = self.reservations.get(reservation_name)
        if not reservation or reservation[0] != reservation_id:
            return False
        self.reservations.pop(reservation_name, None)
        return True

    def setex(self, name, _ttl, value):
        self.values[name] = value
        return True

    def getdel(self, name):
        return self.values.pop(name, None)

    def delete(self, name):
        return int(self.values.pop(name, None) is not None)


class RecordingDelivery:
    def __init__(self):
        self.messages = []

    async def deliver(self, target, code):
        self.messages.append((target, code))


class FailingDelivery:
    async def deliver(self, _target, _code):
        from src.modules.identity.errors import IdentityDomainError

        raise IdentityDomainError(
            "AUTH_VERIFICATION_DELIVERY_FAILED",
            "验证码发送失败，请稍后再试。",
            status_code=503,
        )


class IdentityVerificationTests(unittest.TestCase):
    def setUp(self):
        from src.modules.identity.verification import (
            VerificationDeliveryRegistry,
            VerificationService,
        )

        self.redis = MemoryRedis()
        self.delivery = RecordingDelivery()
        self.service = VerificationService(
            self.redis,
            VerificationDeliveryRegistry({"phone": self.delivery}),
            pepper="test-pepper",
            code_factory=lambda: "123456",
        )

    def test_challenge_delivers_normalized_target_and_is_consumed_once(self):
        challenge = asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target="13800138000",
                client_key="client-a",
            )
        )

        self.assertEqual(self.delivery.messages, [("+8613800138000", "123456")])
        self.assertEqual(challenge.target_hint, "+86****8000")
        self.assertEqual(
            self.service.consume_challenge(challenge.challenge_id, "123456"),
            ("phone", "+8613800138000"),
        )
        with self.assertRaisesRegex(Exception, "验证码无效或已过期"):
            self.service.consume_challenge(challenge.challenge_id, "123456")

    def test_wrong_code_consumes_the_one_time_challenge(self):
        challenge = asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target="+8613900139000",
                client_key="client-b",
            )
        )

        with self.assertRaisesRegex(Exception, "验证码无效或已过期"):
            self.service.consume_challenge(challenge.challenge_id, "000000")
        with self.assertRaisesRegex(Exception, "验证码无效或已过期"):
            self.service.consume_challenge(challenge.challenge_id, "123456")

    def test_target_and_client_cooldowns_are_enforced(self):
        asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target="+8613700137000",
                client_key="client-c",
            )
        )

        with self.assertRaisesRegex(Exception, "请求过于频繁"):
            asyncio.run(
                self.service.request_challenge(
                    channel="phone",
                    target="+8613600136000",
                    client_key="client-c",
                )
            )
        self.assertTrue(all(count == 1 for count in self.redis.counts.values()))

    def test_rejected_target_cooldown_from_other_ips_does_not_burn_quota(self):
        target = "+8613300133000"
        asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target=target,
                client_key="client-first",
            )
        )
        counts_after_delivery = dict(self.redis.counts)

        for client_key in ("client-two", "client-three", "client-four"):
            with self.assertRaisesRegex(Exception, "请求过于频繁"):
                asyncio.run(
                    self.service.request_challenge(
                        channel="phone",
                        target=target,
                        client_key=client_key,
                    )
                )

        self.assertEqual(self.redis.counts, counts_after_delivery)

    def test_delivery_failure_refunds_target_but_retains_egress_budgets(self):
        from src.modules.identity.verification import (
            VerificationDeliveryRegistry,
            VerificationService,
        )

        failing = VerificationService(
            self.redis,
            VerificationDeliveryRegistry({"phone": FailingDelivery()}),
            pepper="test-pepper",
            code_factory=lambda: "123456",
        )
        with self.assertRaisesRegex(Exception, "验证码发送失败"):
            asyncio.run(
                failing.request_challenge(
                    channel="phone",
                    target="+8613200132000",
                    client_key="client-failure",
                )
            )

        self.assertEqual(len(self.redis.counts), 2)
        self.assertTrue(
            all(
                ":quota:ip:" in name or name.endswith(":quota:global-hour")
                for name in self.redis.counts
            )
        )
        self.assertTrue(all(count == 1 for count in self.redis.counts.values()))
        self.assertEqual(self.redis.reservations, {})
        client_cooldowns = [
            name
            for name in self.redis.values
            if name.startswith("auth:verify:client:")
        ]
        self.assertEqual(len(client_cooldowns), 1)
        self.assertFalse(
            any(name.startswith("auth:verify:target:") for name in self.redis.values)
        )

        # Simulate the short client cooldown expiring; target quota is usable,
        # while the next outbound attempt still advances IP/global budgets.
        self.redis.values.pop(client_cooldowns[0], None)
        retry = VerificationService(
            self.redis,
            VerificationDeliveryRegistry({"phone": self.delivery}),
            pepper="test-pepper",
            code_factory=lambda: "123456",
        )
        challenge = asyncio.run(
            retry.request_challenge(
                channel="phone",
                target="+8613200132000",
                client_key="client-failure",
            )
        )
        self.assertTrue(challenge.challenge_id.startswith("verify_"))
        self.assertEqual(
            sorted(self.redis.counts.values()),
            [1, 1, 2, 2],
        )

    def test_connect_challenge_is_bound_to_purpose_user_and_session(self):
        challenge = asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target="+8613500135000",
                client_key="203.0.113.10",
                purpose="connect",
                target_user_id=7,
                session_id="family-1",
            )
        )

        with self.assertRaisesRegex(Exception, "验证码无效或已过期"):
            self.service.consume_challenge(
                challenge.challenge_id,
                "123456",
                expected_purpose="login",
            )

        second = asyncio.run(
            self.service.request_challenge(
                channel="phone",
                target="+8613400134000",
                client_key="203.0.113.11",
                purpose="connect",
                target_user_id=7,
                session_id="family-1",
            )
        )
        with self.assertRaisesRegex(Exception, "验证码无效或已过期"):
            self.service.consume_challenge(
                second.challenge_id,
                "123456",
                expected_purpose="connect",
                target_user_id=8,
                session_id="family-2",
            )

    def test_smtp_starttls_uses_a_certificate_verifying_default_context(self):
        from src.modules.identity.verification import (
            EmailVerificationDelivery,
            SmtpSettings,
        )

        smtp = MagicMock()
        client = smtp.return_value.__enter__.return_value
        tls_context = object()
        delivery = EmailVerificationDelivery(
            SmtpSettings(
                host="smtp.example.com",
                port=587,
                sender="no-reply@example.com",
            )
        )

        with (
            patch("src.modules.identity.verification.smtplib.SMTP", smtp),
            patch(
                "src.modules.identity.verification.ssl.create_default_context",
                return_value=tls_context,
            ) as create_context,
        ):
            delivery._send("person@example.com", "123456")

        create_context.assert_called_once_with()
        client.starttls.assert_called_once_with(context=tls_context)
        client.send_message.assert_called_once()


if __name__ == "__main__":
    unittest.main()

import sys
import threading
import unittest
from asyncio import Event, create_task
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet
from pydantic import ValidationError


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class McpSchemaTests(unittest.TestCase):
    def test_connection_endpoint_is_https_443_without_secrets_or_fragment(self):
        from src.modules.ai.mcp_schemas import AiMcpConnectionCreate

        valid = AiMcpConnectionCreate(
            name="Research",
            endpoint="https://mcp.example.test/server",
        )
        self.assertEqual(
            valid.endpoint,
            "https://mcp.example.test/server",
        )

        invalid_endpoints = [
            "http://mcp.example.test/server",
            "https://user:password@mcp.example.test/server",
            "https://mcp.example.test/server?token=secret",
            "https://mcp.example.test:8443/server",
            "https://mcp.example.test/server#secret",
            "https:///server",
        ]
        for endpoint in invalid_endpoints:
            with self.subTest(endpoint=endpoint), self.assertRaises(ValidationError):
                AiMcpConnectionCreate(name="Invalid", endpoint=endpoint)

    def test_arguments_are_bounded_json_and_confirmation_defaults_false(self):
        from src.modules.ai.mcp_schemas import (
            AI_MCP_MAX_ARGUMENT_BYTES,
            AiMcpToolCallRequest,
        )

        request = AiMcpToolCallRequest(arguments={"query": "sun"})
        self.assertFalse(request.confirmed)
        with self.assertRaises(ValidationError):
            AiMcpToolCallRequest(arguments={"query": object()})
        with self.assertRaises(ValidationError):
            AiMcpToolCallRequest(arguments={"query": "x" * AI_MCP_MAX_ARGUMENT_BYTES})
        with self.assertRaises(ValidationError):
            AiMcpToolCallRequest(arguments={}, command="run")


class CaptureGateway:
    def __init__(self):
        self.discovery = [
            {
                "name": "search",
                "description": "Search public records",
                "inputSchema": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                },
                "annotations": {"readOnlyHint": True},
            }
        ]
        self.result = {"items": [{"title": "Sun"}]}
        self.error = None
        self.discover_calls = []
        self.tool_calls = []

    async def discover(self, endpoint, bearer_token=None):
        self.discover_calls.append((endpoint, bearer_token))
        return self.discovery

    async def call_tool(self, endpoint, name, arguments=None, bearer_token=None):
        self.tool_calls.append((endpoint, name, arguments, bearer_token))
        if self.error:
            raise self.error
        return self.result


def configured_service():
    from src.modules.ai.credentials import CredentialCipher
    from src.modules.ai.mcp_repository import InMemoryAiMcpRepository
    from src.modules.ai.mcp_service import AiMcpService

    repository = InMemoryAiMcpRepository()
    gateway = CaptureGateway()
    cipher = CredentialCipher(Fernet.generate_key().decode("ascii"))
    return AiMcpService(repository, gateway, cipher), repository, gateway


class McpServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_connection_credentials_are_encrypted_and_owner_scoped(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpConnectionUpdate,
        )

        service, repository, _gateway = configured_service()
        created = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
                bearer_token="top-secret-token",
            ),
        )
        self.assertTrue(created.has_bearer_token)
        self.assertEqual(created.bearer_token_hint, "••••oken")
        self.assertFalse(hasattr(created, "bearer_token"))
        record = await repository.get_connection_record(7, created.id)
        self.assertNotIn("top-secret-token", record.bearer_token_ciphertext)

        updated = await service.update_connection(
            7,
            created.id,
            AiMcpConnectionUpdate(
                name="Research v2",
                endpoint="https://mcp.example.test/v2",
                enabled=True,
            ),
        )
        self.assertTrue(updated.has_bearer_token)
        cleared = await service.update_connection(
            7,
            created.id,
            AiMcpConnectionUpdate(
                name="Research v2",
                endpoint="https://mcp.example.test/v2",
                enabled=True,
                clear_bearer_token=True,
            ),
        )
        self.assertFalse(cleared.has_bearer_token)

        with self.assertRaises(AiDomainError) as caught:
            await repository.get_connection_record(8, created.id)
        self.assertEqual(caught.exception.code, "AI_RESOURCE_NOT_FOUND")

    async def test_discovery_is_explicit_validated_and_persisted(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpConnectionUpdate,
        )

        service, _repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
                bearer_token="top-secret-token",
            ),
        )
        discovered = await service.discover(7, connection.id)
        self.assertEqual([tool.name for tool in discovered.tools], ["search"])
        self.assertIsNotNone(discovered.connection.last_discovered_at)
        self.assertEqual(gateway.discover_calls[0][1], "top-secret-token")
        self.assertEqual(
            [tool.name for tool in await service.list_tools(7, connection.id)],
            ["search"],
        )

        disabled = await service.update_connection(
            7,
            connection.id,
            AiMcpConnectionUpdate(
                name="Research",
                endpoint="https://mcp.example.test/server",
                enabled=False,
            ),
        )
        self.assertIsNone(disabled.catalog_revision)
        self.assertIsNone(disabled.last_discovered_at)
        self.assertEqual(await service.list_tools(7, connection.id), [])
        with self.assertRaises(AiDomainError) as caught:
            await service.discover(7, connection.id)
        self.assertEqual(caught.exception.code, "AI_MCP_CONNECTION_DISABLED")

    async def test_remote_configuration_changes_invalidate_the_discovered_catalog(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpConnectionUpdate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
                bearer_token="first-token",
            ),
        )
        discovered = await service.discover(7, connection.id)
        self.assertEqual(
            discovered.connection.catalog_revision,
            discovered.connection.revision,
        )

        renamed = await service.update_connection(
            7,
            connection.id,
            AiMcpConnectionUpdate(
                name="Research renamed",
                endpoint=connection.endpoint,
                enabled=True,
            ),
        )
        self.assertEqual(renamed.catalog_revision, renamed.revision)
        self.assertEqual(
            [tool.name for tool in await service.list_tools(7, connection.id)],
            ["search"],
        )

        endpoint_changed = await service.update_connection(
            7,
            connection.id,
            AiMcpConnectionUpdate(
                name=renamed.name,
                endpoint="https://mcp.example.test/v2",
                enabled=True,
            ),
        )
        self.assertIsNone(endpoint_changed.catalog_revision)
        self.assertIsNone(endpoint_changed.last_discovered_at)
        self.assertEqual(await service.list_tools(7, connection.id), [])
        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )
        self.assertEqual(caught.exception.code, "AI_MCP_REDISCOVERY_REQUIRED")
        self.assertEqual(gateway.tool_calls, [])
        self.assertEqual(repository.calls, [])

        rediscovered = await service.discover(7, connection.id)
        self.assertEqual(
            rediscovered.connection.catalog_revision,
            rediscovered.connection.revision,
        )
        credential_changed = await service.update_connection(
            7,
            connection.id,
            AiMcpConnectionUpdate(
                name=renamed.name,
                endpoint=endpoint_changed.endpoint,
                enabled=True,
                bearer_token="second-token",
            ),
        )
        self.assertIsNone(credential_changed.catalog_revision)
        self.assertIsNone(credential_changed.last_discovered_at)
        self.assertEqual(await service.list_tools(7, connection.id), [])

    async def test_discovery_result_is_rejected_when_connection_changes_in_flight(self):
        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_repository import InMemoryAiMcpRepository
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpConnectionUpdate,
        )
        from src.modules.ai.mcp_service import AiMcpService

        class BlockingDiscoveryGateway(CaptureGateway):
            def __init__(self):
                super().__init__()
                self.started = Event()
                self.release = Event()

            async def discover(self, endpoint, bearer_token=None):
                self.discover_calls.append((endpoint, bearer_token))
                self.started.set()
                await self.release.wait()
                return self.discovery

        repository = InMemoryAiMcpRepository()
        gateway = BlockingDiscoveryGateway()
        service = AiMcpService(
            repository,
            gateway,
            CredentialCipher(Fernet.generate_key().decode("ascii")),
        )
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )

        discovery_task = create_task(service.discover(7, connection.id))
        await gateway.started.wait()
        await service.update_connection(
            7,
            connection.id,
            AiMcpConnectionUpdate(
                name="Research",
                endpoint="https://mcp.example.test/v2",
                enabled=True,
            ),
        )
        gateway.release.set()

        with self.assertRaises(AiDomainError) as caught:
            await discovery_task
        self.assertEqual(caught.exception.code, "AI_MCP_CONNECTION_CHANGED")
        self.assertEqual(await service.list_tools(7, connection.id), [])
        current = await repository.get_connection_record(7, connection.id)
        self.assertEqual(current.connection.endpoint, "https://mcp.example.test/v2")
        self.assertIsNone(current.connection.last_discovered_at)

    async def test_discovery_has_one_overall_deadline(self):
        import asyncio

        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_repository import InMemoryAiMcpRepository
        from src.modules.ai.mcp_schemas import AiMcpConnectionCreate
        from src.modules.ai.mcp_service import AiMcpService

        class HangingDiscoveryGateway(CaptureGateway):
            def __init__(self):
                super().__init__()
                self.cancelled = False

            async def discover(self, endpoint, bearer_token=None):
                try:
                    await Event().wait()
                except asyncio.CancelledError:
                    self.cancelled = True
                    raise

        repository = InMemoryAiMcpRepository()
        gateway = HangingDiscoveryGateway()
        service = AiMcpService(
            repository,
            gateway,
            CredentialCipher(Fernet.generate_key().decode("ascii")),
            discovery_deadline_seconds=0.01,
        )
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )

        with self.assertRaises(AiDomainError) as caught:
            await service.discover(7, connection.id)
        self.assertEqual(caught.exception.code, "AI_MCP_TIMEOUT")
        self.assertEqual(caught.exception.status_code, 504)
        self.assertTrue(gateway.cancelled)
        self.assertEqual(await service.list_tools(7, connection.id), [])

    async def test_tool_call_overall_deadline_is_audited_as_unknown(self):
        import asyncio

        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_repository import InMemoryAiMcpRepository
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )
        from src.modules.ai.mcp_service import AiMcpService

        class HangingCallGateway(CaptureGateway):
            def __init__(self):
                super().__init__()
                self.cancelled = False

            async def call_tool(self, endpoint, name, arguments=None, bearer_token=None):
                try:
                    await Event().wait()
                except asyncio.CancelledError:
                    self.cancelled = True
                    raise

        repository = InMemoryAiMcpRepository()
        gateway = HangingCallGateway()
        service = AiMcpService(
            repository,
            gateway,
            CredentialCipher(Fernet.generate_key().decode("ascii")),
            call_deadline_seconds=0.01,
        )
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )
        self.assertEqual(caught.exception.code, "AI_MCP_CALL_OUTCOME_UNKNOWN")
        self.assertTrue(gateway.cancelled)
        self.assertEqual(repository.calls[-1]["status"], "unknown")
        self.assertEqual(repository.calls[-1]["error_code"], "AI_MCP_TIMEOUT")

    async def test_call_is_not_dispatched_when_connection_changes_before_pending_audit(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        original_begin_call = repository.begin_call

        async def update_before_pending_audit(**value):
            current = await repository.get_connection_record(7, connection.id)
            await repository.update_connection(
                7,
                connection.id,
                AiMcpConnectionCreate(
                    name=current.connection.name,
                    endpoint="https://mcp.example.test/v2",
                    enabled=True,
                ),
                current.bearer_token_ciphertext,
                current.connection.bearer_token_hint,
                current.connection.revision,
            )
            await original_begin_call(**value)

        repository.begin_call = update_before_pending_audit
        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )
        self.assertEqual(caught.exception.code, "AI_MCP_REDISCOVERY_REQUIRED")
        self.assertEqual(gateway.tool_calls, [])
        self.assertEqual(repository.calls, [])

    async def test_tool_call_requires_confirmation_and_audits_metadata_only(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
                bearer_token="top-secret-token",
            ),
        )
        discovered = await service.discover(7, connection.id)
        discovered_revision = discovered.connection.revision

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={"query": "private-search-term"}),
            )
        self.assertEqual(caught.exception.code, "AI_MCP_CONFIRMATION_REQUIRED")
        self.assertEqual(gateway.tool_calls, [])

        result = await service.call_tool(
            7,
            connection.id,
            "search",
            AiMcpToolCallRequest(
                arguments={"query": "private-search-term"},
                confirmed=True,
            ),
        )
        self.assertEqual(result.result, gateway.result)
        self.assertEqual(gateway.tool_calls[0][3], "top-secret-token")
        audit = repository.calls[-1]
        self.assertEqual(audit["connection_revision"], discovered_revision)
        self.assertEqual(audit["argument_keys"], ["query"])
        self.assertEqual(audit["status"], "succeeded")
        self.assertNotIn("private-search-term", repr(audit))
        self.assertNotIn("top-secret-token", repr(audit))
        self.assertNotIn("items", repr(audit["result_metadata"]))

    async def test_dispatched_timeout_is_unknown_and_warns_against_retry(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        gateway.error = AiDomainError(
            "AI_MCP_TIMEOUT",
            "The MCP server did not respond in time.",
            status_code=504,
        )

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )
        self.assertEqual(caught.exception.code, "AI_MCP_CALL_OUTCOME_UNKNOWN")
        self.assertIn("may have executed", caught.exception.message)
        self.assertIn("Do not retry automatically", caught.exception.message)
        self.assertEqual(repository.calls[-1]["status"], "unknown")
        self.assertEqual(repository.calls[-1]["error_code"], "AI_MCP_TIMEOUT")

    async def test_explicit_remote_tool_error_is_failed_not_succeeded(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        gateway.result = {
            "content": [
                {"type": "text", "text": "private remote failure detail"}
            ],
            "isError": True,
        }

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )

        self.assertEqual(caught.exception.code, "AI_MCP_REMOTE_ERROR")
        self.assertEqual(repository.calls[-1]["status"], "failed")
        self.assertEqual(repository.calls[-1]["error_code"], "AI_MCP_REMOTE_ERROR")
        self.assertNotIn("private remote failure detail", repr(repository.calls[-1]))

    async def test_dispatched_protocol_and_unavailable_errors_are_unknown(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        for error_code in (
            "AI_MCP_PROTOCOL_ERROR",
            "AI_MCP_RESPONSE_TOO_LARGE",
            "AI_MCP_UNAVAILABLE",
        ):
            with self.subTest(error_code=error_code):
                service, repository, gateway = configured_service()
                connection = await service.create_connection(
                    7,
                    AiMcpConnectionCreate(
                        name="Research",
                        endpoint="https://mcp.example.test/server",
                    ),
                )
                await service.discover(7, connection.id)
                gateway.error = AiDomainError(error_code, "untrusted detail", status_code=502)

                with self.assertRaises(AiDomainError) as caught:
                    await service.call_tool(
                        7,
                        connection.id,
                        "search",
                        AiMcpToolCallRequest(arguments={}, confirmed=True),
                    )

                self.assertEqual(
                    caught.exception.code,
                    "AI_MCP_CALL_OUTCOME_UNKNOWN",
                )
                self.assertEqual(repository.calls[-1]["status"], "unknown")
                self.assertEqual(repository.calls[-1]["error_code"], error_code)

    async def test_cancelled_dispatched_call_is_audited_unknown(self):
        import asyncio

        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        gateway.error = asyncio.CancelledError()

        with self.assertRaises(asyncio.CancelledError):
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )

        self.assertEqual(repository.calls[-1]["status"], "unknown")
        self.assertEqual(
            repository.calls[-1]["error_code"],
            "AI_MCP_CALL_CANCELLED",
        )

    async def test_tool_is_not_called_when_pending_audit_cannot_be_created(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        repository.begin_call = AsyncMock(side_effect=RuntimeError("database down"))

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )

        self.assertEqual(caught.exception.code, "AI_MCP_AUDIT_UNAVAILABLE")
        self.assertEqual(gateway.tool_calls, [])

    async def test_terminal_audit_failure_reports_unknown_outcome_without_retrying(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        repository.complete_call = AsyncMock(side_effect=RuntimeError("database down"))

        with self.assertRaises(AiDomainError) as caught:
            await service.call_tool(
                7,
                connection.id,
                "search",
                AiMcpToolCallRequest(arguments={}, confirmed=True),
            )

        self.assertEqual(caught.exception.code, "AI_MCP_CALL_OUTCOME_UNKNOWN")
        self.assertEqual(len(gateway.tool_calls), 1)
        self.assertEqual(repository.calls[-1]["status"], "pending")


class GuardRedis:
    def __init__(self):
        self.rate_result = (True, 600)
        self.rate_error = None
        self.acquire_result = True
        self.rate_calls = []
        self.acquire_calls = []
        self.release_calls = []
        self.thread_ids = []

    def consume_multi_fixed_window(self, limits):
        self.thread_ids.append(threading.get_ident())
        self.rate_calls.append(limits)
        if self.rate_error is not None:
            raise self.rate_error
        return self.rate_result

    def acquire_bounded_lease(self, **kwargs):
        self.thread_ids.append(threading.get_ident())
        self.acquire_calls.append(kwargs)
        return self.acquire_result

    def release_bounded_lease(self, **kwargs):
        self.thread_ids.append(threading.get_ident())
        self.release_calls.append(kwargs)
        return 1


class McpRouterGuardTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _request():
        from starlette.requests import Request

        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/ai/v1/mcp/connections/example/discover",
                "headers": [],
                "scheme": "https",
                "server": ("api.sunworld.site", 443),
                "client": ("203.0.113.9", 43210),
            }
        )

    @staticmethod
    def _environment():
        return {
            "AI_MCP_RATE_WINDOW_SECONDS": "600",
            "AI_MCP_USER_RATE_LIMIT": "60",
            "AI_MCP_IP_RATE_LIMIT": "120",
            "AI_MCP_GLOBAL_RATE_LIMIT": "1000",
            "AI_MCP_GLOBAL_CONCURRENCY": "8",
            "AI_MCP_CONCURRENCY_TTL_SECONDS": "120",
            "AI_MCP_DISCOVERY_DEADLINE_SECONDS": "30",
            "AI_MCP_CALL_DEADLINE_SECONDS": "60",
        }

    async def test_rate_limit_is_atomic_hashed_and_fails_closed(self):
        import hashlib

        from fastapi import HTTPException
        from src.modules.ai import mcp_router

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        try:
            with patch.dict("os.environ", self._environment(), clear=False):
                mcp_router.app.redis = redis
                mcp_router.enforce_mcp_remote_rate_limit(self._request(), 7)
                limits = redis.rate_calls[-1]
                user_digest = hashlib.sha256(b"user:7").hexdigest()
                ip_digest = hashlib.sha256(b"ip:203.0.113.9").hexdigest()
                self.assertEqual(
                    limits,
                    [
                        (f"ai:mcp:remote:user:{user_digest}", 60, 600),
                        (f"ai:mcp:remote:ip:{ip_digest}", 120, 600),
                        ("ai:mcp:remote:global", 1000, 600),
                    ],
                )

                redis.rate_result = (False, 47)
                with self.assertRaises(HTTPException) as limited:
                    mcp_router.enforce_mcp_remote_rate_limit(self._request(), 7)
                self.assertEqual(limited.exception.status_code, 429)
                self.assertEqual(limited.exception.headers["Retry-After"], "47")

                redis.rate_error = RuntimeError("redis unavailable")
                with self.assertRaises(HTTPException) as unavailable:
                    mcp_router.enforce_mcp_remote_rate_limit(self._request(), 7)
                self.assertEqual(unavailable.exception.status_code, 503)
                self.assertEqual(
                    unavailable.exception.detail["code"],
                    "AI_MCP_RATE_LIMIT_UNAVAILABLE",
                )

                mcp_router.app.redis = None
                with self.assertRaises(HTTPException) as missing:
                    mcp_router.enforce_mcp_remote_rate_limit(self._request(), 7)
                self.assertEqual(missing.exception.status_code, 503)
        finally:
            mcp_router.app.redis = previous_redis

    async def test_concurrency_rejection_does_not_contact_the_mcp_service(self):
        from fastapi import HTTPException
        from src.modules.ai import mcp_router

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        redis.acquire_result = False
        service = AsyncMock()
        try:
            with patch.dict("os.environ", self._environment(), clear=False):
                mcp_router.app.redis = redis
                with self.assertRaises(HTTPException) as limited:
                    await mcp_router.discover_tools(
                        "mcp_example",
                        self._request(),
                        user_id=7,
                        service=service,
                    )
                self.assertEqual(limited.exception.status_code, 429)
                service.discover.assert_not_awaited()
                self.assertEqual(redis.release_calls, [])
        finally:
            mcp_router.app.redis = previous_redis

    async def test_remote_guards_execute_off_the_event_loop_thread(self):
        from src.modules.ai import mcp_router

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        service = AsyncMock()
        service.discover.return_value = {"tools": []}
        event_loop_thread = threading.get_ident()
        try:
            with patch.dict("os.environ", self._environment(), clear=False):
                mcp_router.app.redis = redis
                await mcp_router.discover_tools(
                    "mcp_example",
                    self._request(),
                    user_id=7,
                    service=service,
                )
        finally:
            mcp_router.app.redis = previous_redis

        service.discover.assert_awaited_once_with(7, "mcp_example")
        self.assertTrue(redis.thread_ids)
        self.assertTrue(
            all(thread_id != event_loop_thread for thread_id in redis.thread_ids)
        )

    async def test_concurrency_lease_must_outlive_operation_deadlines(self):
        from fastapi import HTTPException
        from src.modules.ai import mcp_router

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        invalid_environment = self._environment()
        invalid_environment["AI_MCP_CONCURRENCY_TTL_SECONDS"] = "60"
        try:
            with patch.dict("os.environ", invalid_environment, clear=False):
                mcp_router.app.redis = redis
                with self.assertRaises(HTTPException) as invalid:
                    mcp_router.acquire_mcp_remote_lease()
                self.assertEqual(invalid.exception.status_code, 503)
                self.assertEqual(
                    invalid.exception.detail["code"],
                    "AI_MCP_RATE_LIMIT_CONFIGURATION_INVALID",
                )
                self.assertEqual(redis.acquire_calls, [])
        finally:
            mcp_router.app.redis = previous_redis

    async def test_cancelled_tool_call_releases_lease_and_keeps_unknown_audit(self):
        import asyncio

        from src.modules.ai import mcp_router
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        gateway.error = asyncio.CancelledError()

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        try:
            with patch.dict("os.environ", self._environment(), clear=False):
                mcp_router.app.redis = redis
                with self.assertRaises(asyncio.CancelledError):
                    await mcp_router.call_tool(
                        connection.id,
                        "search",
                        AiMcpToolCallRequest(arguments={}, confirmed=True),
                        self._request(),
                        user_id=7,
                        service=service,
                    )
        finally:
            mcp_router.app.redis = previous_redis

        self.assertEqual(repository.calls[-1]["status"], "unknown")
        self.assertEqual(
            repository.calls[-1]["error_code"],
            "AI_MCP_CALL_CANCELLED",
        )
        self.assertEqual(len(redis.acquire_calls), 1)
        self.assertEqual(len(redis.release_calls), 1)
        self.assertEqual(
            redis.acquire_calls[0]["member"],
            redis.release_calls[0]["member"],
        )

    async def test_timed_out_tool_call_releases_lease_and_returns_unknown(self):
        from fastapi import HTTPException
        from src.modules.ai import mcp_router
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_schemas import (
            AiMcpConnectionCreate,
            AiMcpToolCallRequest,
        )

        service, repository, gateway = configured_service()
        connection = await service.create_connection(
            7,
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/server",
            ),
        )
        await service.discover(7, connection.id)
        gateway.error = AiDomainError(
            "AI_MCP_TIMEOUT",
            "The MCP server did not respond in time.",
            status_code=504,
        )

        previous_redis = getattr(mcp_router.app, "redis", None)
        redis = GuardRedis()
        try:
            with patch.dict("os.environ", self._environment(), clear=False):
                mcp_router.app.redis = redis
                with self.assertRaises(HTTPException) as caught:
                    await mcp_router.call_tool(
                        connection.id,
                        "search",
                        AiMcpToolCallRequest(arguments={}, confirmed=True),
                        self._request(),
                        user_id=7,
                        service=service,
                    )
        finally:
            mcp_router.app.redis = previous_redis

        self.assertEqual(caught.exception.status_code, 502)
        self.assertEqual(
            caught.exception.detail["code"],
            "AI_MCP_CALL_OUTCOME_UNKNOWN",
        )
        self.assertEqual(repository.calls[-1]["status"], "unknown")
        self.assertEqual(repository.calls[-1]["error_code"], "AI_MCP_TIMEOUT")
        self.assertEqual(len(redis.acquire_calls), 1)
        self.assertEqual(len(redis.release_calls), 1)


class McpMySqlRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_remote_update_clears_catalog_in_the_same_transaction(self):
        from datetime import datetime, timezone

        from src.modules.ai.mcp_repository import MySqlAiMcpRepository
        from src.modules.ai.mcp_schemas import AiMcpConnectionCreate

        stamp = datetime.now(timezone.utc)

        class UnitOfWork:
            def __init__(self, database):
                self.database = database
                self.calls = []
                self.committed = False

            def fetch_one(self, sql, params=None):
                self.calls.append(("fetch_one", sql, params))
                return dict(self.database.state)

            def execute(self, sql, params=None):
                self.calls.append(("execute", sql, params))
                if sql.startswith("DELETE FROM ai_mcp_tools"):
                    self.database.tools.clear()
                    return 1
                if sql.startswith("UPDATE ai_mcp_connections"):
                    (
                        name,
                        endpoint,
                        ciphertext,
                        hint,
                        enabled,
                        revision,
                        catalog_revision,
                        last_discovered_at,
                        _connection_id,
                        _user_id,
                        expected_revision,
                    ) = params
                    if self.database.state["revision"] != expected_revision:
                        return 0
                    self.database.state.update(
                        {
                            "name": name,
                            "endpoint": endpoint,
                            "bearer_token_ciphertext": ciphertext,
                            "bearer_token_hint": hint,
                            "enabled": enabled,
                            "revision": revision,
                            "catalog_revision": catalog_revision,
                            "last_discovered_at": last_discovered_at,
                        }
                    )
                    return 1
                return 1

            def commit(self):
                self.committed = True

        class Database:
            def __init__(self):
                self.state = {
                    "id": "mcp_example",
                    "name": "Research",
                    "endpoint": "https://mcp.example.test/server",
                    "enabled": 1,
                    "bearer_token_ciphertext": "encrypted-token",
                    "bearer_token_hint": "••••oken",
                    "revision": 4,
                    "catalog_revision": 4,
                    "last_discovered_at": stamp,
                    "created_at": stamp,
                    "updated_at": stamp,
                }
                self.tools = {"search"}
                self.uow = UnitOfWork(self)

            @contextmanager
            def unit_of_work(self):
                yield self.uow

            def fetch_one(self, _sql, _params=None):
                return dict(self.state)

        database = Database()
        updated = await MySqlAiMcpRepository(database).update_connection(
            7,
            "mcp_example",
            AiMcpConnectionCreate(
                name="Research",
                endpoint="https://mcp.example.test/v2",
                enabled=True,
            ),
            "encrypted-token",
            "••••oken",
            4,
        )

        self.assertEqual(updated.revision, 5)
        self.assertIsNone(updated.catalog_revision)
        self.assertIsNone(updated.last_discovered_at)
        self.assertEqual(database.tools, set())
        self.assertTrue(database.uow.committed)
        transaction_sql = [call[1] for call in database.uow.calls]
        self.assertTrue(any(sql.startswith("DELETE FROM ai_mcp_tools") for sql in transaction_sql))
        self.assertTrue(any(sql.startswith("UPDATE ai_mcp_connections") for sql in transaction_sql))

    async def test_pending_audit_atomically_rejects_a_stale_catalog_revision(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_repository import MySqlAiMcpRepository

        class UnitOfWork:
            def __init__(self, catalog_revision):
                self.catalog_revision = catalog_revision
                self.executions = []
                self.committed = False

            def fetch_one(self, sql, _params=None):
                if "FROM ai_mcp_connections" in sql:
                    return {
                        "enabled": 1,
                        "revision": 3,
                        "catalog_revision": self.catalog_revision,
                    }
                if "FROM ai_mcp_tools" in sql:
                    return {"name": "search"}
                return None

            def execute(self, sql, params=None):
                self.executions.append((sql, params))
                return 1

            def commit(self):
                self.committed = True

        class Database:
            def __init__(self, catalog_revision):
                self.uow = UnitOfWork(catalog_revision)

            @contextmanager
            def unit_of_work(self):
                yield self.uow

        current_database = Database(catalog_revision=3)
        await MySqlAiMcpRepository(current_database).begin_call(
            call_id="mcpcall_example",
            user_id=7,
            connection_id="mcp_example",
            connection_revision=3,
            tool_name="search",
            argument_keys=["query"],
        )
        self.assertTrue(current_database.uow.committed)
        insert = current_database.uow.executions[-1]
        self.assertIn("connection_revision", insert[0])
        self.assertEqual(insert[1][3], 3)

        stale_database = Database(catalog_revision=2)
        with self.assertRaises(AiDomainError) as caught:
            await MySqlAiMcpRepository(stale_database).begin_call(
                call_id="mcpcall_stale",
                user_id=7,
                connection_id="mcp_example",
                connection_revision=3,
                tool_name="search",
                argument_keys=[],
            )
        self.assertEqual(caught.exception.code, "AI_MCP_REDISCOVERY_REQUIRED")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(stale_database.uow.executions, [])
        self.assertFalse(stale_database.uow.committed)


class McpDatabaseSchemaTests(unittest.TestCase):
    def test_declares_control_plane_and_audit_tables(self):
        from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql

        expected = {
            "ai_mcp_connections",
            "ai_mcp_tools",
            "ai_mcp_tool_calls",
        }
        self.assertTrue(expected.issubset(MYSQL_SCHEMA))
        connection_sql = build_create_table_sql(
            "ai_mcp_connections",
            MYSQL_SCHEMA["ai_mcp_connections"],
        )
        audit_sql = build_create_table_sql(
            "ai_mcp_tool_calls",
            MYSQL_SCHEMA["ai_mcp_tool_calls"],
        )
        self.assertIn("bearer_token_ciphertext", connection_sql)
        self.assertIn("`revision` BIGINT NOT NULL DEFAULT 1", connection_sql)
        self.assertIn("`catalog_revision` BIGINT NULL", connection_sql)
        self.assertIn("idx_ai_mcp_connections_user_name", connection_sql)
        self.assertIn("`connection_revision` BIGINT NOT NULL DEFAULT 0", audit_sql)
        self.assertIn("argument_keys", audit_sql)
        self.assertNotIn("arguments`", audit_sql)
        self.assertNotIn("result`", audit_sql)
        self.assertIn("`completed_at` DATETIME(6) NULL", audit_sql)


if __name__ == "__main__":
    unittest.main()

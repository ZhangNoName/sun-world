import json
import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeResolver:
    def __init__(self, *answers):
        self.answers = list(answers or [("1.1.1.1",)])
        self.calls = []

    async def resolve(self, host, port):
        self.calls.append((host, port))
        index = min(len(self.calls) - 1, len(self.answers) - 1)
        return self.answers[index]


class FakeConnector:
    def __init__(self, *, tools=None, result=None, error=None):
        self.tools = tools if tools is not None else {"tools": []}
        self.result = result if result is not None else {"content": [], "isError": False}
        self.error = error
        self.list_calls = []
        self.tool_calls = []

    async def list_tools(self, options):
        self.list_calls.append(options)
        if self.error is not None:
            raise self.error
        return self.tools

    async def call_tool(self, options, name, arguments):
        self.tool_calls.append((options, name, arguments))
        if self.error is not None:
            raise self.error
        return self.result


class McpGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovers_only_serialized_tool_fields_and_hides_token_from_repr(self):
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            tools={
                "tools": [
                    {
                        "name": "weather",
                        "description": "Look up weather",
                        "inputSchema": {"type": "object"},
                        "annotations": {"readOnlyHint": True},
                        "untrustedExtra": "drop-me",
                    }
                ]
            }
        )
        resolver = FakeResolver(("1.1.1.1", "2606:4700:4700::1111"))
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=resolver,
            connector=connector,
        )

        tools = await gateway.discover(
            "https://mcp.example.com/mcp",
            bearer_token="private-token",
        )

        self.assertEqual(
            tools,
            [
                {
                    "name": "weather",
                    "description": "Look up weather",
                    "inputSchema": {"type": "object"},
                    "annotations": {"readOnlyHint": True},
                }
            ],
        )
        self.assertEqual(resolver.calls, [("mcp.example.com", 443)])
        self.assertNotIn("private-token", repr(connector.list_calls[0]))
        self.assertNotIn("mcp.example.com", repr(connector.list_calls[0]))

    async def test_missing_tool_annotations_are_normalized_to_an_empty_object(self):
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            tools={
                "tools": [
                    {
                        "name": "weather",
                        "description": None,
                        "inputSchema": {"type": "object"},
                    }
                ]
            }
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        tools = await gateway.discover("https://mcp.example.com/mcp")

        self.assertEqual(tools[0]["annotations"], {})

    async def test_rejects_non_https_userinfo_fragments_and_non_443_ports(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector()
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )
        invalid_endpoints = [
            "http://mcp.example.com/mcp",
            "https://mcp.example.com:8443/mcp",
            "https://user:password@mcp.example.com/mcp",
            "https://mcp.example.com/mcp#fragment",
            "https:///mcp",
        ]

        for endpoint in invalid_endpoints:
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(AiDomainError) as caught:
                    await gateway.discover(endpoint)
                self.assertEqual(caught.exception.code, "AI_MCP_ENDPOINT_INVALID")
        self.assertEqual(connector.list_calls, [])

    async def test_accepts_exact_and_wildcard_hosts_without_suffix_confusion(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector()
        gateway = McpGateway(
            allowed_hosts=["api.example.com", "*.tools.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        await gateway.discover("https://api.example.com:443/mcp")
        await gateway.discover("https://nested.team.tools.example.com/mcp")
        for endpoint in (
            "https://tools.example.com/mcp",
            "https://eviltools.example.com/mcp",
            "https://api.example.com.attacker.invalid/mcp",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(AiDomainError) as caught:
                    await gateway.discover(endpoint)
                self.assertEqual(caught.exception.code, "AI_MCP_HOST_NOT_ALLOWED")

    async def test_uses_the_validated_ascii_host_for_dns_and_the_actual_request(self):
        from src.modules.ai.mcp_gateway import McpGateway

        resolver = FakeResolver(("1.1.1.1",))
        connector = FakeConnector()
        gateway = McpGateway(
            allowed_hosts=["fass.de"],
            resolver=resolver,
            connector=connector,
        )

        await gateway.discover("https://faß.de/mcp?tenant=one")

        self.assertEqual(resolver.calls, [("fass.de", 443)])
        self.assertEqual(
            connector.list_calls[0].endpoint,
            "https://fass.de/mcp?tenant=one",
        )

    async def test_rejects_when_any_dns_answer_is_not_public(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        blocked_addresses = (
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "224.0.0.1",
            "0.0.0.0",
            "::1",
            "fe80::1",
        )
        for address in blocked_addresses:
            with self.subTest(address=address):
                connector = FakeConnector()
                gateway = McpGateway(
                    allowed_hosts=["mcp.example.com"],
                    resolver=FakeResolver(("1.1.1.1", address)),
                    connector=connector,
                )
                with self.assertRaises(AiDomainError) as caught:
                    await gateway.discover("https://mcp.example.com/mcp")
                self.assertEqual(caught.exception.code, "AI_MCP_ADDRESS_BLOCKED")
                self.assertEqual(connector.list_calls, [])

    async def test_revalidates_dns_before_every_discovery_and_call(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        resolver = FakeResolver(("1.1.1.1",), ("192.168.1.10",))
        connector = FakeConnector()
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=resolver,
            connector=connector,
        )

        await gateway.discover("https://mcp.example.com/mcp")
        with self.assertRaises(AiDomainError) as caught:
            await gateway.call_tool("https://mcp.example.com/mcp", "weather", {})

        self.assertEqual(caught.exception.code, "AI_MCP_ADDRESS_BLOCKED")
        self.assertEqual(len(resolver.calls), 2)
        self.assertEqual(connector.tool_calls, [])

    async def test_dns_resolution_has_a_bounded_deadline(self):
        import asyncio

        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        class HangingResolver:
            async def resolve(self, host, port):
                await asyncio.Future()

        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=HangingResolver(),
            connector=FakeConnector(),
            connect_timeout_seconds=0.01,
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.discover("https://mcp.example.com/mcp")

        self.assertEqual(caught.exception.code, "AI_MCP_TIMEOUT")

    async def test_maps_missing_mcp_sdk_without_leaking_endpoint_or_token(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway, OfficialMcpConnector

        def missing_dependencies():
            raise ModuleNotFoundError("missing at https://mcp.example.com secret-token")

        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=OfficialMcpConnector(missing_dependencies),
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.discover(
                "https://mcp.example.com/mcp",
                bearer_token="secret-token",
            )

        self.assertEqual(caught.exception.code, "AI_MCP_SDK_UNAVAILABLE")
        self.assertNotIn("mcp.example.com", str(caught.exception))
        self.assertNotIn("secret-token", str(caught.exception))

    async def test_official_connector_owns_strict_httpx2_client(self):
        from src.modules.ai.mcp_gateway import (
            McpGateway,
            McpSdkDependencies,
            OfficialMcpConnector,
        )

        captured = {}

        class FakeTimeout:
            def __init__(self, **kwargs):
                self.values = kwargs

        class FakeAsyncClient:
            def __init__(self, **kwargs):
                captured["http_client_kwargs"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc_value, traceback):
                return None

        class FakeHttpx2:
            Timeout = FakeTimeout
            AsyncClient = FakeAsyncClient

            class AsyncByteStream:
                async def aclose(self):
                    return None

        class FakeSdkClient:
            def __init__(self, transport, **kwargs):
                captured["transport"] = transport
                captured["sdk_client_kwargs"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc_value, traceback):
                return None

            async def list_tools(self, **kwargs):
                captured.setdefault("list_tool_kwargs", []).append(kwargs)
                return {"tools": []}

        def fake_streamable_http_client(endpoint, **kwargs):
            captured["endpoint"] = endpoint
            captured["transport_kwargs"] = kwargs
            return "streamable-http-transport"

        dependencies = McpSdkDependencies(
            httpx2=FakeHttpx2,
            client_class=FakeSdkClient,
            streamable_http_client=fake_streamable_http_client,
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=OfficialMcpConnector(lambda: dependencies),
            connect_timeout_seconds=2,
            read_timeout_seconds=11,
            write_timeout_seconds=3,
            pool_timeout_seconds=4,
            max_output_bytes=128,
            max_discovery_bytes=128,
            max_response_bytes=128,
        )

        await gateway.discover(
            "https://mcp.example.com/mcp",
            bearer_token="secret-token",
        )

        client_kwargs = captured["http_client_kwargs"]
        self.assertFalse(client_kwargs["follow_redirects"])
        self.assertFalse(client_kwargs["trust_env"])
        self.assertEqual(
            client_kwargs["headers"],
            {"Authorization": "Bearer secret-token"},
        )
        self.assertEqual(
            client_kwargs["timeout"].values,
            {"connect": 2.0, "read": 11.0, "write": 3.0, "pool": 4.0},
        )
        self.assertEqual(
            captured["transport_kwargs"],
            {
                "http_client": captured["transport_kwargs"]["http_client"],
                "terminate_on_close": True,
            },
        )
        self.assertEqual(captured["sdk_client_kwargs"]["read_timeout_seconds"], 11.0)
        self.assertIsNone(captured["sdk_client_kwargs"]["cache"])
        self.assertEqual(captured["list_tool_kwargs"], [{"cursor": None, "cache_mode": "bypass"}])

        class FakeUrl:
            def __init__(self, host):
                self.host = host
                self.raw_host = host.encode("ascii")

            def copy_with(self, *, host):
                return FakeUrl(host)

        class FakeRequest:
            def __init__(self):
                self.url = FakeUrl("mcp.example.com")
                self.headers = {}
                self.extensions = {}

        request = FakeRequest()
        await client_kwargs["event_hooks"]["request"][0](request)
        self.assertEqual(request.url.host, "1.1.1.1")
        self.assertEqual(request.headers["Host"], "mcp.example.com")
        self.assertEqual(request.headers["Accept-Encoding"], "identity")
        self.assertEqual(request.extensions["sni_hostname"], "mcp.example.com")

        class OversizedStream(FakeHttpx2.AsyncByteStream):
            async def __aiter__(self):
                yield b"x" * 129

        class FakeResponse:
            headers = {}
            stream = OversizedStream()

        response = FakeResponse()
        await client_kwargs["event_hooks"]["response"][0](response)
        with self.assertRaises(Exception) as caught:
            async for _ in response.stream:
                pass
        self.assertEqual(type(caught.exception).__name__, "_McpResponseTooLarge")

        response.headers = {"content-encoding": "gzip"}
        with self.assertRaises(Exception) as caught:
            await client_kwargs["event_hooks"]["response"][0](response)
        self.assertEqual(type(caught.exception).__name__, "_McpProtocolViolation")

    async def test_official_connector_follows_all_tool_pages(self):
        from src.modules.ai.mcp_gateway import McpConnectionOptions, OfficialMcpConnector

        class FakeSession:
            def __init__(self):
                self.calls = []

            async def list_tools(self, **kwargs):
                self.calls.append(kwargs)
                if kwargs["cursor"] is None:
                    return {
                        "tools": [
                            {
                                "name": "first",
                                "inputSchema": {"type": "object"},
                            }
                        ],
                        "nextCursor": "page-2",
                    }
                return {
                    "tools": [
                        {
                            "name": "second",
                            "inputSchema": {"type": "object"},
                        }
                    ]
                }

        session = FakeSession()
        options = McpConnectionOptions(
            endpoint="https://mcp.example.com/mcp",
            host="mcp.example.com",
            resolved_addresses=("1.1.1.1",),
        )

        result = await OfficialMcpConnector._list_all_tools(session, options)

        self.assertEqual([tool["name"] for tool in result["tools"]], ["first", "second"])
        self.assertEqual(
            session.calls,
            [
                {"cursor": None, "cache_mode": "bypass"},
                {"cursor": "page-2", "cache_mode": "bypass"},
            ],
        )

    async def test_httpx2_idn_host_is_compared_by_its_ascii_wire_value(self):
        import httpx2

        from src.modules.ai.mcp_gateway import (
            McpConnectionOptions,
            OfficialMcpConnector,
            _load_mcp_sdk_dependencies,
        )

        options = McpConnectionOptions(
            endpoint="https://xn--fsqu00a.com/mcp",
            host="xn--fsqu00a.com",
            resolved_addresses=("1.1.1.1",),
        )
        client = OfficialMcpConnector._build_http_client(
            _load_mcp_sdk_dependencies(),
            options,
        )
        request = httpx2.Request("POST", options.endpoint)

        await client.event_hooks["request"][0](request)

        self.assertEqual(request.url.host, "1.1.1.1")
        self.assertEqual(request.headers["Host"], "xn--fsqu00a.com")
        self.assertEqual(request.extensions["sni_hostname"], "xn--fsqu00a.com")
        await client.aclose()

    async def test_nested_timeout_is_mapped_to_the_stable_timeout_code(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(error=ExceptionGroup("transport", [TimeoutError()]))
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.discover("https://mcp.example.com/mcp")

        self.assertEqual(caught.exception.code, "AI_MCP_TIMEOUT")

    def test_invalid_byte_limits_are_stable_configuration_errors(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        for invalid in (None, "1024", float("inf")):
            with self.subTest(invalid=invalid):
                with self.assertRaises(AiDomainError) as caught:
                    McpGateway(
                        allowed_hosts=["mcp.example.com"],
                        max_output_bytes=invalid,
                    )
                self.assertEqual(caught.exception.code, "AI_MCP_CONFIGURATION_INVALID")

    async def test_call_tool_returns_json_value_and_truncates_to_byte_limit(self):
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            result={"content": [{"type": "text", "text": "太阳" * 500}], "isError": False}
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
            max_output_bytes=256,
        )

        result = await gateway.call_tool(
            "https://mcp.example.com/mcp",
            "render",
            {"count": 2},
        )

        self.assertTrue(result["_truncated"])
        self.assertGreater(result["originalBytes"], 256)
        serialized = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
        self.assertLessEqual(len(serialized.encode("utf-8")), 256)
        self.assertEqual(connector.tool_calls[0][1:], ("render", {"count": 2}))

    async def test_call_tool_maps_explicit_remote_error_without_leaking_result(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            result={
                "content": [
                    {"type": "text", "text": "private remote failure detail"}
                ],
                "isError": True,
            }
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.call_tool(
                "https://mcp.example.com/mcp",
                "render",
                {"count": 2},
            )

        self.assertEqual(caught.exception.code, "AI_MCP_REMOTE_ERROR")
        self.assertNotIn("private remote failure detail", str(caught.exception))
        self.assertEqual(len(connector.tool_calls), 1)

    async def test_call_tool_rejects_incomplete_remote_result_as_protocol_error(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            result={
                "content": [],
                "isError": False,
                "resultType": "input_required",
            }
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.call_tool(
                "https://mcp.example.com/mcp",
                "render",
                {},
            )

        self.assertEqual(caught.exception.code, "AI_MCP_PROTOCOL_ERROR")

    async def test_connector_failures_are_stable_and_do_not_leak_details(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.mcp_gateway import McpGateway

        connector = FakeConnector(
            error=RuntimeError("secret-token at https://mcp.example.com/internal")
        )
        gateway = McpGateway(
            allowed_hosts=["mcp.example.com"],
            resolver=FakeResolver(),
            connector=connector,
        )

        with self.assertRaises(AiDomainError) as caught:
            await gateway.discover(
                "https://mcp.example.com/mcp",
                bearer_token="secret-token",
            )

        self.assertEqual(caught.exception.code, "AI_MCP_UNAVAILABLE")
        self.assertNotIn("secret-token", str(caught.exception))
        self.assertNotIn("mcp.example.com", str(caught.exception))


if __name__ == "__main__":
    unittest.main()

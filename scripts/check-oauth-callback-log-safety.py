#!/usr/bin/env python3
"""Verify that OAuth callback request targets cannot enter proxy logs."""

from __future__ import annotations

import argparse
import fnmatch
import re
import socket
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Union


REPO_ROOT = Path(__file__).resolve().parents[1]
START_SCRIPT = REPO_ROOT / "apps/api/start.sh"
LEGACY_SYSTEMD_EXAMPLE = REPO_ROOT / "deploy/backend/blog-api.service.example"
NGINX_SNIPPET = REPO_ROOT / "deploy/backend/sun-world-oauth-callback-no-log.conf"
API_SERVER_NAME = "api.sunworld.site"
CALLBACK_PATHS = tuple(
    f"/auth/oauth/{provider}/callback" for provider in ("google", "qq", "wechat")
)
CONFIG_HEADER = re.compile(r"^# configuration file (.+):\s*$")
GLOB_CHARACTERS = frozenset("*?[")
PUBLIC_HTTPS_LISTEN_SOCKETS = frozenset({"443", "0.0.0.0:443", "*:443"})
SUPPORTED_443_LISTEN_SOCKETS = frozenset(
    {*PUBLIC_HTTPS_LISTEN_SOCKETS, "[::]:443"}
)
EXPECTED_API_DNS_ADDRESSES = frozenset({"81.70.43.189"})
FORBIDDEN_ROUTING_DIRECTIVES = frozenset(
    {
        "auth_request",
        "error_page",
        "if",
        "log_subrequest",
        "mirror",
        "post_action",
        "return",
        "rewrite",
        "try_files",
    }
)
FORBIDDEN_INHERITED_STORAGE_PREFIXES = ("proxy_cache", "proxy_store")
FORBIDDEN_INHERITED_STORAGE_DIRECTIVES = frozenset(
    {
        "add_header_inherit",
        "add_trailer",
        "add_trailer_inherit",
        "more_set_headers",
        "more_set_input_headers",
        "proxy_cookie_domain",
        "proxy_cookie_flags",
        "proxy_cookie_path",
        "proxy_ignore_headers",
        "proxy_method",
        "proxy_pass_request_body",
        "proxy_redirect",
        "proxy_set_body",
    }
)
EXPECTED_CALLBACK_DIRECTIVES = (
    ("access_log", ("off",)),
    ("error_log", ("/dev/null", "crit")),
    ("log_subrequest", ("off",)),
    ("mirror", ("off",)),
    ("auth_request", ("off",)),
    ("proxy_intercept_errors", ("off",)),
    ("proxy_redirect", ("off",)),
    ("proxy_cookie_domain", ("off",)),
    ("proxy_cookie_path", ("off",)),
    ("proxy_cookie_flags", ("off",)),
    ("proxy_pass_request_body", ("off",)),
    ("proxy_cache", ("off",)),
    ("proxy_store", ("off",)),
    ("add_header", ("Referrer-Policy", "no-referrer", "always")),
    ("proxy_pass", ("http://127.0.0.1:8000",)),
    ("proxy_set_header", ("Host", "$host")),
    ("proxy_set_header", ("X-Real-IP", "$remote_addr")),
    (
        "proxy_set_header",
        ("X-Forwarded-For", "$proxy_add_x_forwarded_for"),
    ),
    ("proxy_set_header", ("X-Forwarded-Proto", "$scheme")),
)


@dataclass(frozen=True)
class ConfigToken:
    value: str
    kind: str
    tainted: bool
    line: int


@dataclass(frozen=True)
class Directive:
    name: ConfigToken
    args: tuple[ConfigToken, ...]


@dataclass(frozen=True)
class Block:
    name: ConfigToken
    args: tuple[ConfigToken, ...]
    children: tuple["ConfigNode", ...]


ConfigNode = Union[Directive, Block]


def _lex_nginx(text: str) -> tuple[list[ConfigToken], list[str]]:
    """Tokenize Nginx config, normalizing quoted and backslash-escaped tokens."""

    tokens: list[ConfigToken] = []
    errors: list[str] = []
    current: list[str] = []
    current_tainted = False
    current_line = 1
    line = 1
    quote: str | None = None
    escaped = False
    comment = False

    def start_word() -> None:
        nonlocal current_line
        if not current:
            current_line = line

    def flush_word() -> None:
        nonlocal current_tainted
        if not current:
            return
        tokens.append(
            ConfigToken(
                value="".join(current),
                kind="word",
                tainted=current_tainted,
                line=current_line,
            )
        )
        current.clear()
        current_tainted = False

    for character in text:
        if comment:
            if character == "\n":
                comment = False
                line += 1
            continue

        if escaped:
            current_tainted = True
            escaped = False
            if character == "\n":
                line += 1
                continue
            current.append(character)
            continue

        if quote is not None:
            if character == "\\":
                escaped = True
                current_tainted = True
                continue
            if character == quote:
                quote = None
                current_tainted = True
                continue
            current.append(character)
            if character == "\n":
                line += 1
            continue

        if character == "#":
            flush_word()
            comment = True
            continue
        if character == "\\":
            start_word()
            escaped = True
            current_tainted = True
            continue
        if character in {'"', "'"}:
            start_word()
            quote = character
            current_tainted = True
            continue
        if character.isspace():
            flush_word()
            if character == "\n":
                line += 1
            continue
        if character in "{};":
            flush_word()
            tokens.append(
                ConfigToken(
                    value=character,
                    kind=character,
                    tainted=False,
                    line=line,
                )
            )
            continue

        start_word()
        current.append(character)

    if escaped or quote is not None:
        errors.append("unterminated quote or escape in Nginx configuration")
    flush_word()
    return tokens, errors


def _split_nginx_dump(
    text: str,
) -> tuple[list[str], dict[str, str], list[str]]:
    order: list[str] = []
    section_lines: dict[str, list[str]] = {}
    errors: list[str] = []
    current_path: str | None = None
    for line in text.splitlines():
        header = CONFIG_HEADER.match(line)
        if header:
            current_path = header.group(1)
            if current_path in section_lines:
                errors.append("duplicate Nginx dump section prevents validation")
            else:
                order.append(current_path)
                section_lines[current_path] = []
            continue
        if current_path is not None:
            section_lines[current_path].append(line)
    return (
        order,
        {path: "\n".join(lines) for path, lines in section_lines.items()},
        errors,
    )


def _expand_nginx_dump(text: str) -> tuple[list[ConfigToken], list[str]]:
    """Expand `nginx -T` include files as tokens, preserving include order."""

    order, sections, errors = _split_nginx_dump(text)
    if not order:
        return _lex_nginx(text)

    root_path = order[0]
    nginx_prefix = str(Path(root_path).parent)
    token_cache: dict[str, list[ConfigToken]] = {}
    consumed_paths: set[str] = set()

    def section_tokens(path: str) -> list[ConfigToken]:
        if path not in token_cache:
            tokens, lex_errors = _lex_nginx(sections[path])
            token_cache[path] = tokens
            errors.extend(lex_errors)
        return token_cache[path]

    def expand(path: str, stack: tuple[str, ...]) -> list[ConfigToken]:
        if path in stack:
            errors.append("Nginx include cycle prevents validation")
            return []

        consumed_paths.add(path)
        source = section_tokens(path)
        expanded: list[ConfigToken] = []
        index = 0
        directive_start = True
        while index < len(source):
            token = source[index]
            if (
                directive_start
                and token.kind == "word"
                and token.value == "include"
            ):
                if (
                    index + 2 >= len(source)
                    or source[index + 1].kind != "word"
                    or source[index + 2].kind != ";"
                ):
                    errors.append("malformed Nginx include prevents validation")
                    index += 1
                    directive_start = False
                    continue

                include_pattern = source[index + 1].value
                resolved_pattern = (
                    include_pattern
                    if Path(include_pattern).is_absolute()
                    else str(Path(nginx_prefix) / include_pattern)
                )
                matches = [
                    candidate
                    for candidate in order
                    if fnmatch.fnmatchcase(candidate, resolved_pattern)
                ]
                if not matches and not any(
                    character in include_pattern for character in GLOB_CHARACTERS
                ):
                    errors.append("unresolved Nginx include prevents validation")
                for candidate in matches:
                    expanded.extend(expand(candidate, (*stack, path)))
                index += 3
                directive_start = True
                continue

            expanded.append(token)
            directive_start = token.kind in {"{", "}", ";"}
            index += 1
        return expanded

    expanded = expand(root_path, ())
    if any(path not in consumed_paths for path in order):
        errors.append("unreferenced Nginx dump section prevents validation")
    return expanded, errors


class _ConfigParser:
    def __init__(self, tokens: list[ConfigToken]):
        self.tokens = tokens
        self.index = 0
        self.errors: list[str] = []

    def parse(self) -> tuple[tuple[ConfigNode, ...], list[str]]:
        nodes = self._parse_context(expect_close=False)
        return tuple(nodes), self.errors

    def _parse_context(self, *, expect_close: bool) -> list[ConfigNode]:
        nodes: list[ConfigNode] = []
        words: list[ConfigToken] = []
        while self.index < len(self.tokens):
            token = self.tokens[self.index]
            self.index += 1
            if token.kind == "word":
                words.append(token)
                continue
            if token.kind == ";":
                if not words:
                    self.errors.append("empty Nginx directive prevents validation")
                    continue
                nodes.append(Directive(words[0], tuple(words[1:])))
                words = []
                continue
            if token.kind == "{":
                if not words:
                    self.errors.append("anonymous Nginx block prevents validation")
                    continue
                children = self._parse_context(expect_close=True)
                nodes.append(Block(words[0], tuple(words[1:]), tuple(children)))
                words = []
                continue
            if token.kind == "}":
                if words:
                    self.errors.append("unterminated Nginx directive prevents validation")
                if not expect_close:
                    self.errors.append("unexpected Nginx closing brace prevents validation")
                return nodes

        if words:
            self.errors.append("unterminated Nginx directive prevents validation")
        if expect_close:
            self.errors.append("unterminated Nginx block prevents validation")
        return nodes


def _parse_text(text: str) -> tuple[tuple[ConfigNode, ...], list[str]]:
    tokens, errors = _lex_nginx(text)
    nodes, parse_errors = _ConfigParser(tokens).parse()
    return nodes, [*errors, *parse_errors]


def _parse_dump(text: str) -> tuple[tuple[ConfigNode, ...], list[str]]:
    tokens, errors = _expand_nginx_dump(text)
    nodes, parse_errors = _ConfigParser(tokens).parse()
    return nodes, [*errors, *parse_errors]


def _directives(block: Block, name: str) -> list[Directive]:
    return [
        child
        for child in block.children
        if isinstance(child, Directive) and child.name.value == name
    ]


def _http_server_blocks(nodes: tuple[ConfigNode, ...]) -> tuple[list[Block], list[str]]:
    errors: list[str] = []
    http_blocks = [
        node
        for node in nodes
        if isinstance(node, Block) and node.name.value == "http"
    ]
    if http_blocks:
        if any(block.name.tainted for block in http_blocks):
            errors.append("quoted or escaped HTTP block name prevents validation")
        servers = [
            child
            for http_block in http_blocks
            for child in http_block.children
            if isinstance(child, Block) and child.name.value == "server"
        ]
        for http_block in http_blocks:
            for child in http_block.children:
                if isinstance(child, (Directive, Block)) and _dangerous_name(
                    child.name.value
                ):
                    errors.append(
                        "HTTP-level request-routing directive prevents callback safety"
                    )
        return servers, errors

    # Unit fixtures and an extracted vhost may omit the surrounding http block.
    return (
        [
            node
            for node in nodes
            if isinstance(node, Block) and node.name.value == "server"
        ],
        errors,
    )


def _dangerous_name(name: str) -> bool:
    return (
        name in FORBIDDEN_ROUTING_DIRECTIVES
        or name in FORBIDDEN_INHERITED_STORAGE_DIRECTIVES
        or name.startswith(FORBIDDEN_INHERITED_STORAGE_PREFIXES)
        or "_by_lua" in name
        or name.startswith("js_")
        or name.startswith(("otel_", "opentelemetry", "opentracing"))
        or name == "modsecurity"
        or name.startswith("modsecurity_")
        or name == "perl"
        or name.startswith("perl_")
    )


def _server_claims_api(block: Block) -> bool:
    return any(
        argument.value == API_SERVER_NAME
        for directive in _directives(block, "server_name")
        for argument in directive.args
    )


def _has_public_https_listener(block: Block) -> bool:
    for directive in _directives(block, "listen"):
        if not directive.args or directive.name.tainted:
            continue
        if any(argument.tainted for argument in directive.args):
            continue
        endpoint = directive.args[0].value
        options = {argument.value for argument in directive.args[1:]}
        if endpoint in PUBLIC_HTTPS_LISTEN_SOCKETS and "ssl" in options:
            return True
    return False


def _has_public_quic_listener(block: Block) -> bool:
    for directive in _directives(block, "listen"):
        if not directive.args or directive.name.tainted:
            continue
        if any(argument.tainted for argument in directive.args):
            continue
        endpoint = directive.args[0].value
        options = {argument.value for argument in directive.args[1:]}
        if endpoint in PUBLIC_HTTPS_LISTEN_SOCKETS and "quic" in options:
            return True
    return False


def _is_port_443_listener(directive: Directive) -> bool:
    if not directive.args:
        return False
    endpoint = directive.args[0].value
    return endpoint == "443" or endpoint.endswith(":443")


def _validate_live_443_topology(servers: list[Block]) -> list[str]:
    errors: list[str] = []
    for server in servers:
        for directive in _directives(server, "listen"):
            if not _is_port_443_listener(directive):
                continue
            if directive.name.tainted or any(
                argument.tainted for argument in directive.args
            ):
                errors.append("HTTPS listen topology must use canonical tokens")
                continue
            endpoint = directive.args[0].value
            options = {argument.value for argument in directive.args[1:]}
            if endpoint not in SUPPORTED_443_LISTEN_SOCKETS:
                errors.append(
                    "unsupported concrete port-443 listener prevents callback safety"
                )
            if "ssl" not in options and "quic" not in options:
                errors.append("every port-443 listener must declare SSL or QUIC")
    return errors


def _validate_api_dns_addresses(addresses: frozenset[str]) -> list[str]:
    if addresses != EXPECTED_API_DNS_ADDRESSES:
        return [
            "api.sunworld.site DNS must remain on the reviewed IPv4-only address"
        ]
    return []


def _resolve_api_dns_addresses() -> frozenset[str]:
    return frozenset(
        result[4][0]
        for result in socket.getaddrinfo(
            API_SERVER_NAME,
            443,
            type=socket.SOCK_STREAM,
        )
    )


def _validate_callback_block(block: Block) -> list[str]:
    if block.name.tainted or any(argument.tainted for argument in block.args):
        return ["OAuth callback location header must use canonical unescaped tokens"]
    if not all(isinstance(child, Directive) for child in block.children):
        return [
            "OAuth callback location must contain only canonical query-free directives"
        ]

    actual: list[tuple[str, tuple[str, ...]]] = []
    for child in block.children:
        assert isinstance(child, Directive)
        if child.name.tainted or any(argument.tainted for argument in child.args):
            return [
                "OAuth callback location must use canonical unescaped directives"
            ]
        actual.append(
            (child.name.value, tuple(argument.value for argument in child.args))
        )
    if tuple(actual) != EXPECTED_CALLBACK_DIRECTIVES:
        return [
            "OAuth callback location must contain only canonical query-free directives"
        ]
    return []


def _validate_exact_locations(nodes: tuple[ConfigNode, ...]) -> list[str]:
    errors: list[str] = []
    blocks = [node for node in nodes if isinstance(node, Block)]
    for callback_path in CALLBACK_PATHS:
        matches = [
            block
            for block in blocks
            if block.name.value == "location"
            and tuple(argument.value for argument in block.args)
            == ("=", callback_path)
        ]
        if len(matches) != 1:
            errors.append(
                f"must contain exactly one exact callback location for {callback_path}"
            )
            continue
        errors.extend(_validate_callback_block(matches[0]))
    return errors


def validate_snippet_text(text: str) -> list[str]:
    nodes, errors = _parse_text(text)
    if len(nodes) != len(CALLBACK_PATHS) or any(
        not isinstance(node, Block) or node.name.value != "location"
        for node in nodes
    ):
        errors.append("callback snippet may contain only the three exact locations")
    errors.extend(_validate_exact_locations(nodes))
    return errors


def validate_live_nginx_text(
    text: str,
    *,
    resolved_addresses: frozenset[str] = EXPECTED_API_DNS_ADDRESSES,
) -> list[str]:
    nodes, errors = _parse_dump(text)
    errors.extend(_validate_api_dns_addresses(resolved_addresses))
    servers, server_errors = _http_server_blocks(nodes)
    errors.extend(server_errors)
    errors.extend(_validate_live_443_topology(servers))

    api_claims = [server for server in servers if _server_claims_api(server)]
    public_https_claims = [
        server for server in api_claims if _has_public_https_listener(server)
    ]
    if len(public_https_claims) != 1:
        errors.append(
            "live config must contain exactly one public HTTPS server claiming api.sunworld.site"
        )
        return errors

    api_server = public_https_claims[0]
    public_quic_servers = [
        server for server in servers if _has_public_quic_listener(server)
    ]
    if public_quic_servers:
        public_quic_claims = [
            server for server in api_claims if _has_public_quic_listener(server)
        ]
        if len(public_quic_claims) != 1 or public_quic_claims[0] is not api_server:
            errors.append(
                "TCP and QUIC must use the same unique protected api.sunworld.site server"
            )
    if api_server.name.tainted:
        errors.append("API server block name must use a canonical unescaped token")
    for directive in _directives(api_server, "server_name"):
        if directive.name.tainted or any(argument.tainted for argument in directive.args):
            errors.append("API server_name must use canonical unescaped tokens")
    for directive in _directives(api_server, "listen"):
        if directive.name.tainted or any(argument.tainted for argument in directive.args):
            errors.append("API listen directive must use canonical unescaped tokens")

    for child in api_server.children:
        if child.name.tainted:
            errors.append(
                "quoted or escaped directive names are forbidden in the API HTTPS server"
            )
        if child.name.value == "include":
            errors.append("unexpanded include in API HTTPS server prevents validation")
        if _dangerous_name(child.name.value):
            errors.append(
                "API HTTPS server has an inherited or routing directive that can bypass callback safety"
            )

    location_nodes = tuple(
        child
        for child in api_server.children
        if isinstance(child, Block) and child.name.value == "location"
    )
    if any(
        isinstance(grandchild, Block) and grandchild.name.value == "location"
        for location in location_nodes
        for grandchild in location.children
    ):
        errors.append("nested locations prevent proving callback safety")
    errors.extend(_validate_exact_locations(location_nodes))
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--nginx-dump",
        action="store_true",
        help="validate an `nginx -T` dump read from stdin instead of repository files",
    )
    args = parser.parse_args(argv)

    errors: list[str] = []
    if args.nginx_dump:
        try:
            resolved_addresses = _resolve_api_dns_addresses()
        except OSError:
            errors.append("api.sunworld.site DNS could not be resolved safely")
        else:
            errors.extend(
                validate_live_nginx_text(
                    sys.stdin.read(),
                    resolved_addresses=resolved_addresses,
                )
            )
    else:
        start_text = START_SCRIPT.read_text(encoding="utf-8")
        if "--no-access-log" not in start_text:
            errors.append("apps/api/start.sh must disable Uvicorn access logging")
        systemd_example = LEGACY_SYSTEMD_EXAMPLE.read_text(encoding="utf-8")
        uvicorn_lines = [
            line
            for line in systemd_example.splitlines()
            if "uvicorn" in line and "ExecStart=" in line
        ]
        if not uvicorn_lines or any(
            "--no-access-log" not in line for line in uvicorn_lines
        ):
            errors.append(
                "legacy systemd example must disable Uvicorn access logging"
            )
        errors.extend(validate_snippet_text(NGINX_SNIPPET.read_text(encoding="utf-8")))

    if errors:
        print("OAuth callback log-safety check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    target = "live Nginx configuration" if args.nginx_dump else "repository contract"
    print(f"OAuth callback log-safety check passed for {target}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

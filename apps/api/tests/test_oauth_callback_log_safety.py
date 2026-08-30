from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts/check-oauth-callback-log-safety.py"


def _load_checker() -> ModuleType:
    spec = importlib.util.spec_from_file_location("oauth_log_safety", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CHECKER = _load_checker()
CALLBACK_PATHS = (
    "/auth/oauth/google/callback",
    "/auth/oauth/qq/callback",
    "/auth/oauth/wechat/callback",
)


def _safe_location(path: str, extra: str = "") -> str:
    return f"""
location = {path} {{
    access_log off;
    error_log /dev/null crit;
    log_subrequest off;
    mirror off;
    auth_request off;
    proxy_intercept_errors off;
    proxy_redirect off;
    proxy_cookie_domain off;
    proxy_cookie_path off;
    proxy_cookie_flags off;
    proxy_pass_request_body off;
    proxy_cache off;
    proxy_store off;
    add_header Referrer-Policy no-referrer always;
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    {extra}
}}
"""


SAFE_LOCATIONS = "".join(_safe_location(path) for path in CALLBACK_PATHS)
GENERIC_LOCATION = """
location / {
    proxy_pass http://127.0.0.1:8000;
}
"""


def _location(header: str) -> str:
    return f"""
location {header} {{
    proxy_pass http://bad;
}}
"""


def _api_server(
    locations: str,
    *,
    listen: str = "listen 443 ssl;",
    server_directives: str = "",
) -> str:
    return f"""
server {{
    {listen}
    server_name api.sunworld.site;
    {server_directives}
    {locations}
    {GENERIC_LOCATION}
}}
"""


class OAuthCallbackLogSafetyTests(unittest.TestCase):
    def test_ignores_protected_locations_in_unrelated_server(self) -> None:
        unrelated = f"""
server {{
    listen 443 ssl;
    server_name unrelated.example;
    {SAFE_LOCATIONS}
}}
"""
        self.assertEqual(
            CHECKER.validate_live_nginx_text(
                unrelated + _api_server(SAFE_LOCATIONS)
            ),
            [],
        )

    def test_rejects_locations_only_in_unrelated_server(self) -> None:
        text = f"""
server {{
    listen 443 ssl;
    server_name unrelated.example;
    {SAFE_LOCATIONS}
}}
server {{
    listen 443 ssl;
    server_name api.sunworld.site;
    {GENERIC_LOCATION}
}}
"""
        errors = CHECKER.validate_live_nginx_text(text)
        self.assertTrue(
            any("exactly one exact callback location" in error for error in errors)
        )

    def test_exact_locations_out_rank_prefix_and_regex_locations(self) -> None:
        competing = _location("^~ /auth/oauth/") + _location("~ ^/auth/")
        self.assertEqual(
            CHECKER.validate_live_nginx_text(
                _api_server(competing + SAFE_LOCATIONS)
            ),
            [],
        )

    def test_parses_competing_single_line_location_without_losing_exact_match(self) -> None:
        single_line = "location ^~ /auth/oauth/ { proxy_pass http://bad; }"
        self.assertEqual(
            CHECKER.validate_live_nginx_text(
                _api_server(single_line + SAFE_LOCATIONS)
            ),
            [],
        )

    def test_parses_unrelated_single_or_multiline_server_blocks(self) -> None:
        configurations = (
            (
                "server { listen 443 ssl; server_name hidden.example; }"
                + _api_server(SAFE_LOCATIONS)
            ),
            (
                "http { server { listen 443 ssl; server_name hidden.example; }"
                + _api_server(SAFE_LOCATIONS)
                + "}"
            ),
            (
                "http { server\n{\nlisten 443 ssl;\n"
                "server_name hidden.example;\n}\n"
                + _api_server(SAFE_LOCATIONS)
                + "}"
            ),
        )
        for configuration in configurations:
            with self.subTest(configuration=configuration):
                self.assertEqual(
                    CHECKER.validate_live_nginx_text(configuration),
                    [],
                )

    def test_rejects_server_level_routing_directives(self) -> None:
        directives = (
            "rewrite ^/auth/oauth/google/callback$ /leak last;",
            "return 302 /leak;",
            "if ($request_uri) {\nreturn 302 /leak;\n}",
            "try_files $uri /leak;",
            "error_page 502 /leak;",
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("routing directive" in error for error in errors)
                )

    def test_quoted_braces_do_not_hide_following_locations(self) -> None:
        self.assertEqual(
            CHECKER.validate_live_nginx_text(
                _api_server(
                    SAFE_LOCATIONS,
                    server_directives='set $brace "}";',
                )
            ),
            [],
        )

    def test_rejects_unclosed_quote(self) -> None:
        errors = CHECKER.validate_live_nginx_text(
            _api_server(
                SAFE_LOCATIONS,
                server_directives='set $value "unterminated;',
            )
        )
        self.assertTrue(any("unterminated quote or escape" in error for error in errors))

    def test_quoted_fake_api_server_is_not_parsed_as_configuration(self) -> None:
        fake_server = _api_server(SAFE_LOCATIONS)
        text = f"""
http {{
    log_format decoy '{fake_server}';
    server {{
        listen 443 ssl default_server;
        server_name _;
        {GENERIC_LOCATION}
    }}
}}
"""
        errors = CHECKER.validate_live_nginx_text(text)
        self.assertTrue(any("claiming api.sunworld.site" in error for error in errors))

    def test_rejects_quoted_or_escaped_routing_directive_names(self) -> None:
        directives = (
            '"return" 302 /leak;',
            '"rewrite" ^ /leak last;',
            r"rewri\te ^ /leak last;",
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_loopback_api_decoy(self) -> None:
        decoy = _api_server(
            SAFE_LOCATIONS,
            listen="listen 127.0.0.1:443 ssl;",
        )
        public_default = """
server {
    listen 443 ssl default_server;
    server_name _;
    location / { proxy_pass http://bad; }
}
"""
        errors = CHECKER.validate_live_nginx_text(decoy + public_default)
        self.assertTrue(any("unsupported concrete" in error for error in errors))

    def test_rejects_concrete_https_listener(self) -> None:
        extra = f"""
server {{
    listen 192.0.2.10:443 ssl;
    server_name _;
    {GENERIC_LOCATION}
}}
"""
        errors = CHECKER.validate_live_nginx_text(
            _api_server(SAFE_LOCATIONS) + extra
        )
        self.assertTrue(any("unsupported concrete" in error for error in errors))

    def test_rejects_new_ipv6_dns_route_before_it_can_hit_a_default_vhost(self) -> None:
        ipv6_default = f"""
server {{
    listen [::]:443 ssl;
    server_name _;
    {GENERIC_LOCATION}
}}
"""
        errors = CHECKER.validate_live_nginx_text(
            _api_server(SAFE_LOCATIONS) + ipv6_default,
            resolved_addresses=frozenset(
                {"81.70.43.189", "2001:db8::10"}
            ),
        )
        self.assertTrue(any("IPv4-only address" in error for error in errors))

    def test_rejects_separate_unprotected_quic_api_vhost(self) -> None:
        safe_tcp = _api_server(SAFE_LOCATIONS)
        unsafe_quic = f"""
server {{
    listen 443 quic default_server;
    server_name api.sunworld.site;
    {GENERIC_LOCATION}
}}
"""
        errors = CHECKER.validate_live_nginx_text(safe_tcp + unsafe_quic)
        self.assertTrue(any("TCP and QUIC" in error for error in errors))

    def test_rejects_inherited_subrequest_directives(self) -> None:
        for directive in (
            "mirror /mirror;",
            "log_subrequest on;",
            "auth_request /authorize;",
            "post_action /after;",
        ):
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_inherited_proxy_cache_or_store_directives(self) -> None:
        directives = (
            "proxy_cache oauth;",
            "proxy_cache_valid 303 1m;",
            "proxy_cache_key $request_uri;",
            "proxy_cache_use_stale error;",
            "proxy_ignore_headers Set-Cookie;",
            "proxy_store on;",
            "proxy_store_access user:rw;",
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_inherited_proxy_request_or_response_mutation(self) -> None:
        directives = (
            "proxy_redirect ~^ $request_uri;",
            "proxy_cookie_path / $request_uri;",
            "proxy_cookie_domain localhost $request_uri;",
            "proxy_cookie_flags ~ secure samesite=$request_uri;",
            "proxy_set_body $request_uri;",
            "proxy_method POST;",
            "proxy_pass_request_body on;",
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_callback_overrides_inherited_add_header(self) -> None:
        text = _api_server(
            SAFE_LOCATIONS,
            server_directives="add_header X-Debug $request_uri always;",
        )
        self.assertEqual(CHECKER.validate_live_nginx_text(text), [])

        unsafe = SAFE_LOCATIONS.replace(
            "add_header Referrer-Policy no-referrer always;",
            "",
            1,
        )
        errors = CHECKER.validate_live_nginx_text(
            _api_server(
                unsafe,
                server_directives="add_header X-Debug $request_uri always;",
            )
        )
        self.assertTrue(
            any("canonical query-free" in error for error in errors)
        )

    def test_rejects_response_header_inheritance_modes_or_trailers(self) -> None:
        directives = (
            "add_header_inherit merge;",
            "add_trailer X-Debug $request_uri always;",
            "add_trailer_inherit merge;",
            'more_set_headers "X-Debug: $request_uri";',
            'more_set_input_headers "X-Debug: $request_uri";',
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_inherited_observability_or_waf_directives(self) -> None:
        directives = (
            "otel_trace on;",
            "otel_span_attr callback $request_uri;",
            "opentelemetry on;",
            "opentracing on;",
            "modsecurity on;",
            "modsecurity_rules_file /etc/nginx/modsecurity.conf;",
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_embedded_script_handlers(self) -> None:
        directives = (
            "server_rewrite_by_lua_block { ngx.log(ngx.ERR, ngx.var.request_uri); }",
            "set_by_lua_block $x { return ngx.var.request_uri; }",
            'set_by_lua $x "return ngx.var.request_uri";',
            'js_set $x "module.value";',
            'perl_set $x "sub { return 1; }";',
        )
        for directive in directives:
            with self.subTest(directive=directive):
                errors = CHECKER.validate_live_nginx_text(
                    _api_server(SAFE_LOCATIONS, server_directives=directive)
                )
                self.assertTrue(
                    any("bypass callback safety" in error for error in errors)
                )

    def test_rejects_callback_internal_routing_or_inline_directives(self) -> None:
        mutations = (
            ("proxy_intercept_errors off;", "proxy_intercept_errors off;\nrewrite ^ /leak last;"),
            ("proxy_set_header Host $host;", "proxy_set_header Host $host; rewrite ^ /leak last;"),
            ("proxy_set_header Host $host;", "proxy_set_header Host $host; return 302 /leak;"),
            ("access_log off;", "access_log off; access_log /tmp/leak.log;"),
            ("error_log /dev/null crit;", "error_log /dev/null crit; error_log /tmp/leak.log notice;"),
        )
        for original, replacement in mutations:
            with self.subTest(replacement=replacement):
                unsafe = SAFE_LOCATIONS.replace(original, replacement, 1)
                errors = CHECKER.validate_snippet_text(unsafe)
                self.assertTrue(
                    any("canonical query-free" in error for error in errors)
                )

    def test_rejects_missing_https_and_duplicate_api_server(self) -> None:
        missing_https = _api_server(SAFE_LOCATIONS, listen="listen 80;")
        self.assertTrue(
            any(
                "public HTTPS server" in error
                for error in CHECKER.validate_live_nginx_text(missing_https)
            )
        )

        duplicated = _api_server(SAFE_LOCATIONS) + _api_server(SAFE_LOCATIONS)
        self.assertTrue(
            any(
                "exactly one public HTTPS server claiming" in error
                for error in CHECKER.validate_live_nginx_text(duplicated)
            )
        )

    def test_expands_absolute_and_relative_nginx_dump_includes(self) -> None:
        for include_pattern in (
            "/etc/nginx/sites-enabled/*",
            "sites-enabled/*",
        ):
            with self.subTest(include_pattern=include_pattern):
                dump = f"""# configuration file /etc/nginx/nginx.conf:
http {{
    include {include_pattern};
}}
# configuration file /etc/nginx/sites-enabled/api:
server {{
    listen 443 ssl;
    server_name api.sunworld.site;
    include /etc/nginx/snippets/oauth-callback.conf;
    {GENERIC_LOCATION}
}}
# configuration file /etc/nginx/snippets/oauth-callback.conf:
{SAFE_LOCATIONS}
"""
                self.assertEqual(CHECKER.validate_live_nginx_text(dump), [])

    def test_rejects_dangerous_http_level_directive_from_expanded_include(
        self,
    ) -> None:
        dump = f"""# configuration file /etc/nginx/nginx.conf:
http {{
    include /etc/nginx/conf.d/*;
    include /etc/nginx/sites-enabled/*;
}}
# configuration file /etc/nginx/conf.d/inherited.conf:
proxy_redirect ~^ $request_uri;
# configuration file /etc/nginx/sites-enabled/api:
{_api_server(SAFE_LOCATIONS)}
"""
        errors = CHECKER.validate_live_nginx_text(dump)
        self.assertTrue(
            any("HTTP-level request-routing" in error for error in errors)
        )

    def test_rejects_spoofed_nginx_dump_section_header(self) -> None:
        dump = f"""# configuration file /etc/nginx/nginx.conf:
http {{
    include /etc/nginx/sites-enabled/*;
}}
# configuration file /etc/nginx/sites-enabled/api:
{_api_server(SAFE_LOCATIONS)}
# configuration file /tmp/not-a-real-section:
server_rewrite_by_lua_block {{ ngx.log(ngx.ERR, ngx.var.request_uri); }}
"""
        errors = CHECKER.validate_live_nginx_text(dump)
        self.assertTrue(any("unreferenced Nginx dump section" in error for error in errors))

    def test_snippet_requires_nonpersistent_error_log_policy(self) -> None:
        unsafe = SAFE_LOCATIONS.replace(
            "error_log /dev/null crit;",
            "error_log /var/log/nginx/error.log;",
            1,
        )
        errors = CHECKER.validate_snippet_text(unsafe)
        self.assertTrue(
            any("canonical query-free" in error for error in errors)
        )


if __name__ == "__main__":
    unittest.main()

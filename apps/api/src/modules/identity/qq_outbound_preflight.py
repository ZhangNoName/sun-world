from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass

import httpx

from .providers import OAuthProviderRegistry, QQOAuthProvider, _oauth_http_client


EXPECTED_PUBLIC_ORIGINS = {
    "AUTH_PUBLIC_API_ORIGIN": "https://api.sunworld.site",
    "AUTH_PUBLIC_WEB_ORIGIN": "https://sunworld.site",
}
EXPECTED_RUNTIME_ENV = "production"
DISABLED_PROVIDER_CONFIGURATION = {
    "google": (
        "AUTH_GOOGLE_CLIENT_ID",
        "AUTH_GOOGLE_CLIENT_SECRET",
        "AUTH_GOOGLE_OUTBOUND_PROXY_URL",
    ),
    "wechat": ("AUTH_WECHAT_CLIENT_ID", "AUTH_WECHAT_CLIENT_SECRET"),
}


@dataclass(frozen=True)
class PreflightTarget:
    hostname: str
    url: str


PREFLIGHT_TARGETS = (
    PreflightTarget("graph.qq.com", QQOAuthProvider.authorization_endpoint),
    PreflightTarget("graph.qq.com", QQOAuthProvider.token_endpoint),
    PreflightTarget("graph.qq.com", QQOAuthProvider.openid_endpoint),
    PreflightTarget("graph.qq.com", QQOAuthProvider.userinfo_endpoint),
)


def _reachable_status(status_code: int) -> bool:
    return 200 <= status_code < 500 and status_code != 407


def _public_origins_are_production_safe() -> bool:
    """Validate effective production defaults without printing configuration."""
    return all(
        os.getenv(name, expected) == expected
        for name, expected in EXPECTED_PUBLIC_ORIGINS.items()
    )


def _environment_values_are_empty(environment_names: tuple[str, ...]) -> bool:
    return all(not os.getenv(name, "").strip() for name in environment_names)


def _registry_is_qq_only(registry: OAuthProviderRegistry) -> bool:
    return registry.is_enabled("qq") and all(
        _environment_values_are_empty(environment_names)
        and not registry.is_enabled(provider_name)
        for provider_name, environment_names in DISABLED_PROVIDER_CONFIGURATION.items()
    )


async def run_preflight() -> int:
    try:
        if os.getenv("BLOG_RUNTIME_ENV") != EXPECTED_RUNTIME_ENV:
            print("QQ login runtime is not production-safe.", file=sys.stderr)
            return 1
        if not _public_origins_are_production_safe():
            print("QQ login public origins are not production-safe.", file=sys.stderr)
            return 1
        registry = OAuthProviderRegistry.from_env()
        if not registry.is_enabled("qq"):
            print("QQ login is not enabled.", file=sys.stderr)
            return 1
        if not _registry_is_qq_only(registry):
            print("OAuth provider matrix is not QQ-only.", file=sys.stderr)
            return 1
        client = _oauth_http_client()
    except Exception:
        print("QQ outbound preflight could not initialize.", file=sys.stderr)
        return 1

    failed = False
    async with client:
        for target in PREFLIGHT_TARGETS:
            try:
                async with client.stream("GET", target.url) as response:
                    status_code = response.status_code
            except (httpx.HTTPError, OSError, ValueError):
                failed = True
                print(f"{target.hostname}: connection failed", file=sys.stderr)
                continue

            if not _reachable_status(status_code):
                failed = True
                print(
                    f"{target.hostname}: unexpected HTTP {status_code}",
                    file=sys.stderr,
                )
                continue
            print(f"{target.hostname}: HTTP {status_code}")
    return 1 if failed else 0


def main() -> int:
    try:
        return asyncio.run(run_preflight())
    except Exception:
        print("QQ outbound preflight failed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

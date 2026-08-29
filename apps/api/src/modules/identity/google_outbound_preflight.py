from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass

import httpx

from .providers import (
    GOOGLE_JWKS_ENDPOINT,
    GOOGLE_OUTBOUND_PROXY_ENV,
    GOOGLE_TOKEN_ENDPOINT,
    GOOGLE_USERINFO_ENDPOINT,
    OAuthProviderRegistry,
    _oauth_http_client,
    _validate_google_outbound_proxy_url,
)


GOOGLE_DISCOVERY_ENDPOINT = (
    "https://accounts.google.com/.well-known/openid-configuration"
)
EXPECTED_PUBLIC_ORIGINS = {
    "AUTH_PUBLIC_API_ORIGIN": "https://api.sunworld.site",
    "AUTH_PUBLIC_WEB_ORIGIN": "https://sunworld.site",
}
EXPECTED_RUNTIME_ENV = "production"


@dataclass(frozen=True)
class PreflightTarget:
    hostname: str
    url: str
    expects_public_success: bool


PREFLIGHT_TARGETS = (
    PreflightTarget("accounts.google.com", GOOGLE_DISCOVERY_ENDPOINT, True),
    PreflightTarget("oauth2.googleapis.com", GOOGLE_TOKEN_ENDPOINT, False),
    PreflightTarget("openidconnect.googleapis.com", GOOGLE_USERINFO_ENDPOINT, False),
    PreflightTarget("www.googleapis.com", GOOGLE_JWKS_ENDPOINT, True),
)


def _expected_status(target: PreflightTarget, status_code: int) -> bool:
    if target.expects_public_success:
        return status_code == 200
    return 400 <= status_code < 500 and status_code != 407


def _public_origins_are_production_safe() -> bool:
    """Validate effective production defaults without printing configuration."""
    return all(
        os.getenv(name, expected) == expected
        for name, expected in EXPECTED_PUBLIC_ORIGINS.items()
    )


async def run_preflight() -> int:
    try:
        if os.getenv("BLOG_RUNTIME_ENV") != EXPECTED_RUNTIME_ENV:
            print("Google login runtime is not production-safe.", file=sys.stderr)
            return 1
        if not _public_origins_are_production_safe():
            print("Google login public origins are not production-safe.", file=sys.stderr)
            return 1
        registry = OAuthProviderRegistry.from_env()
        if not registry.is_enabled("google"):
            print("Google login is not enabled.", file=sys.stderr)
            return 1
        proxy_url = _validate_google_outbound_proxy_url(
            os.getenv(GOOGLE_OUTBOUND_PROXY_ENV, "")
        )
        client = _oauth_http_client(proxy_url=proxy_url)
    except Exception:
        print("Google outbound preflight could not initialize.", file=sys.stderr)
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

            if not _expected_status(target, status_code):
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
        print("Google outbound preflight failed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

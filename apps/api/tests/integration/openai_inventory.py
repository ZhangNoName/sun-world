"""Read-only official model inventory for explicit local maintenance, not runtime."""

import asyncio
from datetime import date, datetime, timezone
import json
import math
import re

from src.modules.ai.local_openai import create_local_openai_proxy
from src.modules.ai.local_openai_transport import _close
from src.modules.ai.openai_responses import MODEL, OpenAiResponsesProxy
from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig

FAILED = 'AGENT_OPENAI_INVENTORY_FAILED'
ENDPOINT = 'https://api.openai.com/v1/models'
RESPONSE_LIMIT = 262144
_DATE_ID = re.compile(re.escape(MODEL) + r'-([0-9]{4}-[0-9]{2}-[0-9]{2})\Z')


def fail():
    raise ValueError(FAILED) from None


def decode(raw):
    # The generation decoder's 8192-node cap cannot hold 2048 model records.
    # Keep this independent catalogue bound without relaxing production JSON.
    if type(raw) is not bytes or len(raw) > RESPONSE_LIMIT:
        fail()
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                fail()
            value[key] = item
        return value
    remaining = 32768
    def visit(item, depth=0):
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth > 32:
            fail()
        if type(item) is dict:
            for key, value in item.items():
                key.encode('utf-8')
                visit(value, depth + 1)
        elif type(item) is list:
            for value in item:
                visit(value, depth + 1)
        elif type(item) is str:
            item.encode('utf-8')
        elif type(item) is float:
            if not math.isfinite(item):
                fail()
        elif item is not None and type(item) not in (bool, int):
            fail()
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: fail())
        visit(value)
        return value
    except Exception:
        fail()


def project(value):
    """Validate every basic record; copy only fixed/validated candidate IDs."""
    if (type(value) is not dict or value.get('object') != 'list'
            or type(value.get('data')) is not list or len(value['data']) > 2048):
        fail()
    seen, candidates = set(), []
    for row in value['data']:
        if (type(row) is not dict or row.get('object') != 'model'
                or type(row.get('id')) is not str or not row['id'].strip() or len(row['id']) > 256
                or type(row.get('created')) is not int or row['created'] < 0
                or type(row.get('owned_by')) is not str or len(row['owned_by']) > 256):
            fail()
        model = row['id']
        if model in seen:
            fail()
        seen.add(model)
        match = _DATE_ID.fullmatch(model)
        if match is not None:
            try:
                date.fromisoformat(match.group(1))
            except ValueError:
                continue
            candidates.append(model)
            if len(candidates) > 32:
                fail()
    return {'visible': MODEL in seen, 'dated_candidate_ids': sorted(candidates)}


def approved(proxy):
    if type(proxy) is not OpenAiResponsesProxy:
        fail()
    config = proxy.config
    if (not isinstance(config, ProviderConfig) or config.provider != 'openai-local' or config.model != MODEL
            or config.base_url != 'https://api.openai.com/v1' or config.auth_mode != 'bearer'):
        fail()


async def inspect_inventory(*, proxy_url=None):
    client, primary = None, None
    try:
        async with asyncio.timeout(15):
            # The maintained factory rejects production before key-file access,
            # and keeps the original DNS/public-IP/pin/Host/SNI/CONNECT policy.
            proxy = create_local_openai_proxy(proxy_url=proxy_url)
            approved(proxy)
            provider = proxy._factory(proxy.config, connect_timeout_seconds=3, read_timeout_seconds=8,
                write_timeout_seconds=3, pool_timeout_seconds=1, total_timeout_seconds=15,
                max_stream_bytes=RESPONSE_LIMIT, max_output_tokens=1024)
            if not isinstance(provider, OpenAiCompatibleProvider):
                fail()
            options = await provider._connection_options(ENDPOINT)
            dependencies = provider._load_dependencies()
            client = provider._build_http_client(dependencies, options)
            await client.__aenter__()
            response = await client.get(options.endpoint)
            if response.status_code != 200:
                fail()
            shape = project(decode(response.content))
    except BaseException as error:
        primary = error
        if not isinstance(error, Exception):
            raise
        fail()
    finally:
        if client is not None:
            try:
                await _close(client)
            except asyncio.CancelledError:
                raise
            except Exception:
                if primary is None:
                    fail()
    # A report exists only after owned client cleanup has completed. Close may
    # extend the request timeout while draining cancellation; no success leaks.
    return {'version': 'sun-world-openai-model-inventory/1',
        'checked_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'profile': 'openai-local', 'model': MODEL, **shape, 'generation_requests': 0,
        'immutable_model_revision_verified': False}

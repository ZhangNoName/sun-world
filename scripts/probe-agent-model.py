#!/usr/bin/env python3
"""Probe the approved keyless test model through maintained local AI V1 CLI.

Own Redis + in-memory catalog/history, no application lifespan/config or keys.
This is connectivity evidence, not tool/semantic or production acceptance.
"""

import argparse
import asyncio
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def probe(environment, node):
    import uvicorn
    from fastapi import FastAPI
    from app_instance import app as registry_app
    from src.database.redis.redis_manage import RedisManager
    from src.modules.ai.public import create_keyless_validation_proxy
    from src.modules.ai.providers import OpenAiCompatibleProvider
    from src.modules.ai.repositories import InMemoryAiRepository
    from src.modules.ai.router import router, get_ai_service, get_optional_ai_user_id
    from src.modules.ai.schemas import AiProviderCatalogInput
    from src.modules.ai.service import AiService
    from urllib.parse import urlsplit

    # Factory refuses production runtime. No personal address/key is accepted.
    config = create_keyless_validation_proxy().config
    parsed = urlsplit(config.base_url)
    os.environ['AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'] = parsed.scheme + '://' + parsed.netloc
    redis = load('model_probe_redis', ROOT / 'scripts/test-agent-redis.py').verified_client(environment)
    store = RedisManager.__new__(RedisManager)
    store.r, store.key_prefix = redis, 'model-probe:' + uuid4().hex
    repository = InMemoryAiRepository()
    class Providers:
        @staticmethod
        def create(selected):
            return OpenAiCompatibleProvider(selected, max_output_tokens=256,
                connect_timeout_seconds=3, read_timeout_seconds=12, write_timeout_seconds=3,
                pool_timeout_seconds=1, total_timeout_seconds=15, max_stream_bytes=16384)
    service = AiService(repository, Providers())
    await service.create_provider_catalog_entry(AiProviderCatalogInput(id=config.provider,
        name='Approved keyless local validation model', default_base_url=config.base_url,
        default_model=config.model, auth_mode='none', is_default=True))
    local = FastAPI()
    local.include_router(router)
    local.dependency_overrides[get_ai_service] = lambda: service
    local.dependency_overrides[get_optional_ai_user_id] = lambda: None
    registry_app.redis = store
    registry_app.auth = None
    class Server(uvicorn.Server):
        @contextmanager
        def capture_signals(self):
            yield
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(('127.0.0.1', 0))
    listener.listen(16)
    listener.setblocking(False)
    origin = f'http://127.0.0.1:{listener.getsockname()[1]}'
    server = Server(uvicorn.Config(local, lifespan='off', access_log=False, log_level='warning',
                                  proxy_headers=False, timeout_graceful_shutdown=3))
    task = asyncio.create_task(server.serve(sockets=[listener]))
    async def cli(arguments):
        child = await asyncio.create_subprocess_exec(str(node), str(ROOT / 'packages/cli/bin/sun-world.mjs'),
            *arguments, '--base-url', origin, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            async with asyncio.timeout(20):
                output, _diagnostic = await child.communicate()
            if child.returncode != 0 or len(output) > 262144:
                raise RuntimeError('Local model CLI probe failed')
            return json.loads(output)
        finally:
            if child.returncode is None:
                child.terminate()
                try:
                    async with asyncio.timeout(3):
                        await child.wait()
                except TimeoutError:
                    child.kill()
                    await child.wait()
    try:
        async with asyncio.timeout(5):
            while not server.started:
                if task.done():
                    await task
                    raise RuntimeError('Local model probe host failed')
                await asyncio.sleep(.01)
        models = await cli(['ai', 'models'])
        print(json.dumps({'phase': 'catalog', 'result': models}, ensure_ascii=False), flush=True)
        result = await cli(['ai', 'ask', '--model-id', config.provider, '--json', '--message',
                            '这是本地连通测试，请仅回复：本地模型可用。'])
        print(json.dumps({'phase': 'text_smoke', 'model': config.model, 'result': result}, ensure_ascii=False), flush=True)
    finally:
        server.should_exit = True
        try:
            async with asyncio.timeout(8):
                await task
        finally:
            listener.close()
            redis.close()
            redis.connection_pool.disconnect()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--redis-server', required=True, type=Path)
    parser.add_argument('--node', required=True, type=Path)
    arguments = parser.parse_args()
    try:
        node = arguments.node.resolve(strict=True)
        if subprocess.check_output([str(node), '--version'], text=True, timeout=3).strip() != 'v' + (ROOT / '.nvmrc').read_text().strip():
            raise ValueError('Use project Node')
        redis = load('model_probe_owned_redis', ROOT / 'scripts/test-agent-redis.py')
        with redis.owned_redis(arguments.redis_server) as environment:
            asyncio.run(probe(environment, node))
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as error:
        print('Local model probe failed (' + type(error).__name__ + '); no production API or business credentials were used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

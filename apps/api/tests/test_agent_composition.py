"""The explicit factory is inert until a host mounts and enables it."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import redis

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.module_composition import create_blog_qa_application


class CompositionTests(unittest.IsolatedAsyncioTestCase):
    async def test_inert_factory_requires_bounded_redis_and_keeps_switch_authoritative(self):
        calls = []
        async def forbidden(*_args, **_kwargs):
            calls.append('unexpected IO')
            self.fail('Disabled/inert composition performed IO')
        worker = SimpleNamespace(start=forbidden, inspect=forbidden, cancel=forbidden, probe=forbidden)
        options = dict(auth_manager=object(), worker=worker, model_proxy=forbidden,
            worker_credential='s'*43, bundle_hash='a'*64, model_id='fixed',
            site_origin='https://site.test', user_ids=[1], enabled=lambda: False)
        for timeout in [None, 0, -1, 3, float('inf'), float('nan'), True]:
            client = redis.Redis(unix_socket_path='/synthetic-unavailable', socket_timeout=timeout,
                                 socket_connect_timeout=1)
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                create_blog_qa_application(object(), object(), redis_client=client, **options)
            client.close()
        for changes in [{'retry_on_timeout': True}, {'retry_on_error': [redis.TimeoutError]},
                {'retry': redis.retry.Retry(redis.backoff.NoBackoff(), 1)}]:
            client = redis.Redis(socket_timeout=1, socket_connect_timeout=1, **changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                create_blog_qa_application(object(), object(), redis_client=client, **options)
            client.close()
        # redis-py's Redis(unix_socket_path=...) drops connect timeout; use an
        # explicit pool so the factory checks the actual connection settings.
        client = redis.Redis(connection_pool=redis.ConnectionPool(
            connection_class=redis.connection.UnixDomainSocketConnection,
            path='/synthetic-unavailable', socket_timeout=1, socket_connect_timeout=1))
        self.addCleanup(client.close)
        service = create_blog_qa_application(object(), object(), redis_client=client, **options)
        self.assertFalse(service.enabled())
        self.assertFalse(await service.available())
        self.assertEqual((await service.capabilities(None))['reason'], 'AGENT_DISABLED')
        await service.close()
        self.assertEqual(calls, [])

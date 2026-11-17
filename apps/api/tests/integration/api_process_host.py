"""Private pipe bootstrap for a disposable API, never a production entrypoint."""

import asyncio
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import ssl
import stat
import sys
import threading
import time
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import UUID

ROOT = Path(__file__).resolve().parents[4]
VERSION = 'sun-world-api-process-host/1'
ERROR = 'AGENT_API_PROCESS_FIXTURE_FAILED'
ENV_KEYS = {f'SUN_WORLD_AGENT_{kind}_{field}' for kind in ('MYSQL', 'REDIS', 'MONGO')
    for field in ('ROOT', 'NONCE')}
_OUTPUT = threading.Lock()
STAGES = frozenset(('configuration', 'imports', 'owned_databases', 'auth', 'tls',
    'application', 'listener', 'serve', 'ready', 'cleanup', 'channel'))
ERROR_TYPES = frozenset(('CancelledError', 'TimeoutError', 'ModuleNotFoundError', 'ImportError',
    'AttributeError', 'TypeError', 'KeyError', 'PermissionError', 'FileNotFoundError',
    'ConnectionError', 'ValueError', 'RuntimeError', 'AssertionError', 'OSError', 'OtherError'))
_STAGE, _FAILURE = 'configuration', None


def error_projection(error):
    kind = 'OtherError'
    for error_class in (asyncio.CancelledError, TimeoutError, ModuleNotFoundError, ImportError,
            AttributeError, TypeError, KeyError, PermissionError, FileNotFoundError,
            ConnectionError, ValueError, RuntimeError, AssertionError, OSError):
        if isinstance(error, error_class):
            kind = error_class.__name__  # Only classes in the fixed list above.
            break
    line, trace = 0, error.__traceback__
    while trace is not None:
        if trace.tb_frame.f_code.co_filename == __file__:
            line = trace.tb_lineno
        trace = trace.tb_next
    return {'stage': _STAGE, 'error_type': kind, 'line': line if 0 <= line <= 65536 else 0}


def remember_failure(error):
    global _FAILURE
    if _FAILURE is None:
        _FAILURE = error_projection(error)


def fail():
    return RuntimeError(ERROR)


def linux_mode(arguments):
    if arguments == [] and sys.platform == 'darwin':
        return False
    if arguments == ['--linux-stack'] and sys.platform == 'linux':
        return True
    raise fail()


def _configuration(value):
    fields = {'version', 'root', 'database', 'namespace', 'auth_secret', 'gateway_secret',
        'worker_secret', 'origin', 'worker_origin', 'bundle_hash', 'phase', 'listener_fd', 'owned_env'}
    if (type(value) is not dict or set(value) != fields or value['version'] != VERSION
            or value['phase'] not in ('accepted', 'model_hold', 'completed', 'restarted')
            or type(value['listener_fd']) is not int or not 3 <= value['listener_fd'] <= 1048576
            or not re.fullmatch(r'sunworld_sdk_[0-9a-f]{32}', value['database'])
            or not re.fullmatch(r'agent:sdk:[0-9a-f]{32}:\{sun-world\}', value['namespace'])
            or not re.fullmatch(r'[0-9a-f]{64}', value['bundle_hash'])
            or type(value['owned_env']) is not dict or set(value['owned_env']) != ENV_KEYS):
        raise fail()
    for name in ('auth_secret', 'gateway_secret', 'worker_secret'):
        if type(value[name]) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', value[name]):
            raise fail()
    for name in ('origin', 'worker_origin'):
        parsed = urlsplit(value[name])
        if (parsed.scheme != 'https' or parsed.hostname not in ('localhost', '127.0.0.1')
                or parsed.username or parsed.password or not parsed.port
                or parsed.path or parsed.query or parsed.fragment):
            raise fail()
    root = Path(value['root'])
    info = root.lstat()
    if (not root.is_absolute() or not root.name.startswith('sun-world-sdk-stack-')
            or root.resolve() != root or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700):
        raise fail()
    for name in ('key.pem', 'cert.pem'):
        info = (root / name).lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1
                or not 1 <= info.st_size <= 65536):
            raise fail()
    for name, item in value['owned_env'].items():
        if type(item) is not str or len(item) > 4096 or '\0' in item:
            raise fail()
    return value


def configuration(value):
    try:
        return _configuration(value)
    except Exception:
        raise fail() from None


def read_configuration():
    os.set_blocking(0, False)
    raw, deadline = bytearray(), time.monotonic() + 5
    while time.monotonic() < deadline:
        if not select.select([0], [], [], max(0, deadline - time.monotonic()))[0]:
            raise fail()
        part = os.read(0, 32769 - len(raw))
        if not part:
            raise fail()
        raw.extend(part)
        if len(raw) > 32768:
            raise fail()
        if b'\n' in raw:
            if raw.count(b'\n') != 1 or not raw.endswith(b'\n'):
                raise fail()
            return bytes(raw)
    raise fail()


def emit(value):
    raw = json.dumps(value, separators=(',', ':'), allow_nan=False).encode() + b'\n'
    if len(raw) > 8192:
        raise fail()
    with _OUTPUT:
        offset = 0
        while offset < len(raw):
            if not select.select([], [1], [], 2)[1]:
                raise fail()
            offset += os.write(1, raw[offset:])


def install_hooks(application, phase, notify=emit):
    if phase == 'accepted':
        accept = application.ledger.accept
        def committed(*args, **kwargs):
            admission = accept(*args, **kwargs)  # Actual UOW commit already returned.
            if admission.created:
                notify({'event': 'accepted', 'run_id': admission.run['id']})
                if not threading.Event().wait(12):
                    raise fail()
            return admission
        application.ledger.accept = committed
    check, observed = application.gateway._check, set()
    def verified(uow, call, audience, **kwargs):
        result = check(uow, call, audience, **kwargs)
        if audience == 'model' and call.run_id not in observed:
            observed.add(call.run_id)
            notify({'event': 'credential', 'run_id': call.run_id, 'execution_id': call.execution_id,
                'generation': call.generation, 'audience': audience,
                'token': call.token, 'service': call.service_credential})
        return result
    application.gateway._check = verified


def verify_listener(listener, origin):
    """Probe the inherited socket without nonportable SO_ACCEPTCONN."""
    if (listener.family != socket.AF_INET
            or listener.getsockname() != ('127.0.0.1', urlsplit(origin).port)
            or listener.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) != socket.SOCK_STREAM):
        raise fail()
    listener.setblocking(False)
    try:
        connection, _ = listener.accept()
    except BlockingIOError:
        return  # A real empty listening queue; other OSErrors remain failures.
    connection.close()  # Before readiness, never process an already queued peer.


async def run(config):
    global _STAGE
    _STAGE = 'imports'
    os.environ.update(config['owned_env'])
    sys.path.insert(0, str(ROOT / 'apps/api'))
    sys.path.insert(0, str(Path(__file__).parent))
    import sdk_stack as stack
    from src.modules.agent_runtime.cleanup import finish_cleanup
    _STAGE = 'owned_databases'
    stack.AgentStackTests.setUpClass()
    pool = mongo = application = server = server_task = None
    errors = []
    current = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, current.cancel)
    try:
        root = Path(config['root'])
        pool = stack.SocketManager(stack.AgentStackTests.socket, config['database'], pool_size=4)
        mongo = stack.load('api_owned_mongo', ROOT / 'scripts/test-agent-mongo.py').verified_client(os.environ)
        _STAGE = 'auth'
        session = stack.OwnedSessionRedis(stack.AgentStackTests.redis, config['namespace'] + ':auth')
        auth = stack.AuthManager(stack.UserManager(pool), session,
            secret_key=config['auth_secret'], refresh_reuse_grace_seconds=0)
        _STAGE = 'tls'
        tls = ssl.create_default_context(cafile=str(root / 'cert.pem'))
        tls.load_cert_chain(str(root / 'cert.pem'), str(root / 'key.pem'))
        worker = stack.WorkerHttpTransport(config['worker_origin'],
            service_credential=config['worker_secret'], tls_context=tls)
        state = SimpleNamespace(mode='hold' if config['phase'] == 'model_hold' else 'complete',
            model_steps=0, model_requests=[], model_id=stack.MODEL, real_proxy=None,
            model_started=asyncio.Event(), model_cancelled=asyncio.Event())
        async def model(body):
            if state.mode != 'hold':
                return await stack.Fixture.model(state, body)
            task = asyncio.create_task(stack.Fixture.model(state, body))
            try:
                await state.model_started.wait()
                emit({'event': 'model_hold'})
                return await task
            finally:
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        _STAGE = 'application'
        application = stack.create_blog_qa_application(pool, stack.ContentMongo(mongo[config['database']]),
            auth_manager=auth, redis_client=stack.AgentStackTests.redis, worker=worker, model_proxy=model,
            worker_credential=config['gateway_secret'], bundle_hash=config['bundle_hash'], model_id=stack.MODEL,
            site_origin=config['origin'], user_ids=[1], enabled=lambda: True,
            admission_namespace=config['namespace'])
        install_hooks(application, config['phase'])
        host = stack.FastAPI()
        peer = __import__('hashlib').sha256(ssl.PEM_cert_to_DER_cert((root / 'cert.pem').read_text())).hexdigest()
        host.include_router(stack.create_public_run_router(application, allowed_origins=[config['origin']]))
        host.include_router(stack.create_private_run_router(application.gateway,
            verify_peer=lambda request: request.scope.get('sunworld.test.tls_peer_sha256') == peer))
        _STAGE = 'listener'
        listener = socket.socket(fileno=config['listener_fd'])
        verify_listener(listener, config['origin'])
        _STAGE = 'serve'
        settings = stack.uvicorn.Config(host, http=stack.PeerProtocol, ssl_keyfile=str(root / 'key.pem'),
            ssl_certfile=str(root / 'cert.pem'), ssl_ca_certs=str(root / 'cert.pem'),
            ssl_cert_reqs=ssl.CERT_REQUIRED, lifespan='off', access_log=False, log_level='critical',
            proxy_headers=False, timeout_keep_alive=1, timeout_graceful_shutdown=3)
        server = stack.TestServer(settings)
        await application.ready()
        server_task = asyncio.create_task(server.serve(sockets=[listener]))
        async with asyncio.timeout(8):
            while not server.started:
                if server_task.done():
                    await server_task
                    raise fail()
                await asyncio.sleep(.01)
        _STAGE = 'ready'
        emit({'event': 'ready'})
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        raise
    except BaseException as error:
        remember_failure(error)
        raise
    finally:
        _STAGE = 'cleanup'
        async def cleanup():
            if server:
                server.should_exit = True
            for operation in (application.close if application else None,
                    (lambda: asyncio.wait_for(server_task, 8)) if server_task else None,
                    (lambda: asyncio.to_thread(pool.close)) if pool else None,
                    (lambda: asyncio.to_thread(mongo.close)) if mongo else None):
                if operation:
                    try:
                        await operation()
                    except BaseException as error:
                        errors.append(True)
                        remember_failure(error)
            stack.AgentStackTests.tearDownClass()
        await finish_cleanup(cleanup())
        for signum in (signal.SIGINT, signal.SIGTERM):
            loop.remove_signal_handler(signum)
        if errors:
            raise fail()


def main():
    global _STAGE, _FAILURE
    _STAGE, _FAILURE = 'configuration', None
    try:
        linux_mode(sys.argv[1:])
        raw = read_configuration()
        sys.path.insert(0, str(Path(__file__).parent))
        from official_channel_codec import strict_json
        config = configuration(strict_json(raw, 32768))
        os.set_blocking(1, False)
        asyncio.run(run(config))
        return 0
    except (KeyboardInterrupt, asyncio.CancelledError):
        return 0
    except BaseException as error:
        remember_failure(error)
        emit({'event': 'error', 'code': ERROR, **_FAILURE})
        return 1


if __name__ == '__main__':
    sys.exit(main())

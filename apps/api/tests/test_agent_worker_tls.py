"""Self-owned loopback TLS probe; no application/production certificates."""

import asyncio
import json
import shutil
import ssl
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_agent_worker_transport as fixtures
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.worker_transport import WorkerHttpTransport


@unittest.skipUnless(shutil.which('openssl'), 'openssl required for an ephemeral TLS certificate')
class WorkerTlsTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_tls_trust_and_hostname_are_required(self):
        fixture = fixtures.WorkerTransportTests()
        fixture.setUp()
        with tempfile.TemporaryDirectory(prefix='agent-worker-tls-') as temporary:
            directory = Path(temporary)
            certificate, key = directory / 'certificate.pem', directory / 'private.pem'
            config = directory / 'openssl.cnf'
            config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n'
                '[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost\n'
                'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n')
            await asyncio.to_thread(subprocess.run, [shutil.which('openssl'), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                '-days', '1', '-config', str(config), '-keyout', str(key), '-out', str(certificate)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=10)
            key.chmod(0o600)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certificate, key)
            requests = []
            async def handle(reader, writer):
                try:
                    header = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 2)
                    lengths = [int(line.split(b':', 1)[1]) for line in header.split(b'\r\n')
                               if line.lower().startswith(b'content-length:')]
                    raw = await reader.readexactly(lengths[0]) if lengths else b''
                    requests.append(json.loads(raw))
                    ack = json.dumps({**fixture.binding, 'status': 'running'}).encode()
                    writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: '
                                 + str(len(ack)).encode() + b'\r\nConnection: close\r\n\r\n' + ack)
                    await writer.drain()
                finally:
                    writer.close()
                    await writer.wait_closed()
            server = await asyncio.start_server(handle, '127.0.0.1', 0, ssl=context)
            loop = asyncio.get_running_loop()
            original_handler = loop.get_exception_handler()
            def handshake_error(current_loop, error):
                # Expected client rejections end the server handshake. Keep
                # unrelated loop errors visible to the normal test handler.
                if (error.get('message') == 'Error on transport creation for incoming connection'
                        and isinstance(error.get('exception'), (ssl.SSLError, ConnectionResetError))):
                    return
                if original_handler:
                    original_handler(current_loop, error)
                else:
                    current_loop.default_exception_handler(error)
            loop.set_exception_handler(handshake_error)
            try:
                port = server.sockets[0].getsockname()[1]
                trusted = ssl.create_default_context(cafile=str(certificate))
                transport = WorkerHttpTransport(f'https://localhost:{port}',
                    service_credential='s'*43, tls_context=trusted)
                self.assertEqual((await transport.start(fixture.payload))['status'], 'running')
                for origin, tls in [(f'https://localhost:{port}', None), (f'https://127.0.0.1:{port}', trusted)]:
                    with self.assertRaises(LedgerError):
                        await WorkerHttpTransport(origin, service_credential='s'*43,
                            tls_context=tls).start(fixture.payload)
                self.assertEqual(len(requests), 1)
            finally:
                server.close()
                await server.wait_closed()
                await asyncio.sleep(.05)
                loop.set_exception_handler(original_handler)

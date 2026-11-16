"""Bounded test-control frames. No destination, headers or credentials exist."""

import asyncio
import base64
import json
import math
import os
import struct

VERSION = 'sun-world-linux-official-channel/1'
ERROR = 'AGENT_OFFICIAL_CHANNEL_FAILED'
MAX_FRAME = 400000
MAX_RAW = 262144
OPS = frozenset(('probe', 'count', 'generate', 'evaluation', 'cancel'))


def fail():
    return RuntimeError(ERROR)


def exact(value, keys):
    return type(value) is dict and set(value) == set(keys)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
        separators=(',', ':'), sort_keys=True).encode('utf-8')


def strict_json(raw, maximum=MAX_RAW):
    def pairs(items):
        value = {}
        for key, child in items:
            if key in value:
                raise fail()
            value[key] = child
        return value
    def constant(_):
        raise fail()
    remaining = 8192
    def visit(value, depth=0):
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth > 32:
            raise fail()
        if type(value) is str:
            value.encode('utf-8', errors='strict')
        elif type(value) is float and not math.isfinite(value):
            raise fail()
        elif type(value) is dict:
            for key, child in value.items():
                visit(key, depth + 1)
                visit(child, depth + 1)
        elif type(value) is list:
            for child in value:
                visit(child, depth + 1)
    try:
        if type(raw) is not bytes or len(raw) > maximum:
            raise fail()
        value = json.loads(raw.decode('utf-8', errors='strict'),
            object_pairs_hook=pairs, parse_constant=constant)
        visit(value)
        return value
    except Exception:
        raise fail() from None


def _raw(value, maximum):
    if type(value) is not str or len(value) > ((maximum + 2) // 3) * 4:
        raise fail()
    try:
        raw = base64.b64decode(value, validate=True)
        if len(raw) > maximum or base64.b64encode(raw).decode('ascii') != value:
            raise fail()
        return raw
    except Exception:
        raise fail() from None


def _identity(value):
    if value['version'] != VERSION or type(value['id']) is not int or not 1 <= value['id'] <= 64:
        raise fail()


def decode_request(raw):
    value = strict_json(raw, MAX_FRAME)
    if (not exact(value, ('version', 'id', 'op', 'payload'))
            or type(value['op']) is not str or value['op'] not in OPS):
        raise fail()
    _identity(value)
    payload = _raw(value['payload'], MAX_RAW)
    if (value['op'] in ('probe', 'cancel')) != (payload == b''):
        raise fail()
    return value['id'], value['op'], payload


def decode_response(raw, op):
    value = strict_json(raw, MAX_FRAME)
    if (type(op) is not str or op not in OPS - {'cancel'} or not exact(value, ('version', 'id', 'status', 'payload'))
            or value['status'] not in ('ok', 'failed', 'cancelled')):
        raise fail()
    _identity(value)
    payload = _raw(value['payload'], 65536 if op == 'generate' else 4096)
    if value['status'] != 'ok' and payload or value['status'] == 'ok' and not payload:
        raise fail()
    return value['id'], value['status'], payload


def encode_request(identity, op, raw=b''):
    if (type(raw) is not bytes or type(identity) is not int or not 1 <= identity <= 64
            or type(op) is not str or op not in OPS):
        raise fail()
    value = canonical({'version': VERSION, 'id': identity, 'op': op,
        'payload': base64.b64encode(raw).decode('ascii')})
    decode_request(value)
    return value


def encode_response(identity, status, raw=b'', *, op='generate'):
    if (type(raw) is not bytes or type(identity) is not int or not 1 <= identity <= 64
            or type(status) is not str or status not in ('ok', 'failed', 'cancelled')):
        raise fail()
    value = canonical({'version': VERSION, 'id': identity, 'status': status,
        'payload': base64.b64encode(raw).decode('ascii')})
    decode_response(value, op)
    return value


class AsyncFdFrames:
    """Own nonblocking descriptors and every temporary event-loop watcher."""
    def __init__(self, read_fd, write_fd, *, own_fds=True):
        if (type(own_fds) is not bool
                or any(type(fd) is not int or fd < (3 if own_fds else 0) for fd in (read_fd, write_fd))):
            raise fail()
        self.read_fd, self.write_fd, self._own = read_fd, write_fd, own_fds
        self.closed, self._closing, self._reading = False, False, False
        self._close_unknown = False
        self._fds = {read_fd, write_fd} if own_fds else set()
        self._waiters = {}
        self._writes = asyncio.Lock()
        try:
            for fd in {read_fd, write_fd}:
                os.set_inheritable(fd, False)
                os.set_blocking(fd, False)
        except Exception:
            for fd in self._fds:
                try:
                    os.close(fd)
                except OSError:
                    pass
            self._fds.clear()
            raise fail() from None

    async def _wait(self, fd, writing=False):
        if self._closing:
            raise fail()
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        key = (fd, writing)
        if key in self._waiters:
            raise fail()
        self._waiters[key] = future
        def ready():
            if not future.done():
                future.set_result(None)
        add = loop.add_writer if writing else loop.add_reader
        remove = loop.remove_writer if writing else loop.remove_reader
        try:
            add(fd, ready)
            await future
        finally:
            if self._waiters.get(key) is future:
                remove(fd)
                self._waiters.pop(key, None)

    async def _read(self, size, *, eof=False):
        chunks, total = [], 0
        while total < size:
            if self._closing:
                raise fail()
            try:
                part = os.read(self.read_fd, size - total)
            except BlockingIOError:
                await self._wait(self.read_fd)
                continue
            if not part:
                if eof and total == 0:
                    return None
                raise fail()
            chunks.append(part)
            total += len(part)
        return b''.join(chunks)

    async def read_frame(self):
        if self._reading or self._closing:
            raise fail()
        self._reading = True
        try:
            first = await self._read(1, eof=True)
            if first is None:
                return None
            async with asyncio.timeout(4):
                prefix = first + await self._read(3)
                size = struct.unpack('!I', prefix)[0]
                if not 1 <= size <= MAX_FRAME:
                    raise fail()
                return await self._read(size)
        except BaseException as error:
            try:
                await self.aclose()
            except Exception:
                if not isinstance(error, asyncio.CancelledError):
                    raise fail() from None
            if isinstance(error, asyncio.CancelledError):
                raise
            raise fail() from None
        finally:
            self._reading = False

    async def write_frame(self, raw):
        if type(raw) is not bytes or not 1 <= len(raw) <= MAX_FRAME:
            raise fail()
        async with self._writes:
            try:
                async with asyncio.timeout(4):
                    data, offset = struct.pack('!I', len(raw)) + raw, 0
                    while offset < len(data):
                        if self._closing:
                            raise fail()
                        try:
                            size = os.write(self.write_fd, data[offset:])
                        except BlockingIOError:
                            await self._wait(self.write_fd, True)
                            continue
                        if size <= 0:
                            raise fail()
                        offset += size
            except BaseException as error:
                try:
                    await self.aclose()
                except Exception:
                    if not isinstance(error, asyncio.CancelledError):
                        raise fail() from None
                if isinstance(error, asyncio.CancelledError):
                    raise
                raise fail() from None

    async def aclose(self):
        if self.closed:
            return
        self._closing = True
        loop = asyncio.get_running_loop()
        for (fd, writing), future in list(self._waiters.items()):
            (loop.remove_writer if writing else loop.remove_reader)(fd)
            if not future.done():
                future.set_exception(fail())
        self._waiters.clear()
        for fd in list(self._fds):
            self._fds.remove(fd)  # Unknown close ACK must never close a reused fd.
            try:
                os.close(fd)
            except OSError:
                self._close_unknown = True
        self.closed = not self._close_unknown
        if self._close_unknown:
            raise fail()

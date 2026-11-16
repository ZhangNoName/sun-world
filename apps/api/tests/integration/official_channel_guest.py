"""One privileged controller channel; never pass this descriptor to a Worker."""

import asyncio
import os
import stat
import sys
import termios

from official_channel_codec import (AsyncFdFrames, OPS, decode_response,
    encode_request, fail)


def configure_raw_terminal(descriptor):
    value = termios.tcgetattr(descriptor)
    value[0] &= ~(termios.IGNBRK | termios.BRKINT | termios.PARMRK | termios.ISTRIP
        | termios.INLCR | termios.IGNCR | termios.ICRNL | termios.IXON | termios.IXOFF
        | termios.IXANY | termios.INPCK)
    value[1] &= ~termios.OPOST
    value[2] = (value[2] & ~(termios.CSIZE | termios.PARENB)) | termios.CS8
    value[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN)
    value[6][termios.VMIN], value[6][termios.VTIME] = 1, 0
    termios.tcsetattr(descriptor, termios.TCSANOW, value)
    actual = termios.tcgetattr(descriptor)
    if (actual[0] & (termios.IXON | termios.IXOFF | termios.IXANY | termios.ICRNL | termios.INLCR | termios.IGNCR)
            or actual[1] & termios.OPOST
            or actual[3] & (termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN)
            or actual[6][termios.VMIN] != 1 or actual[6][termios.VTIME] != 0):
        raise fail()


async def drain(task):
    """Drain an owned cleanup task despite repeated caller cancellation."""
    interrupted = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            interrupted = True
        except Exception:
            break
    return task.result(), interrupted


class OfficialChannelGuest:
    def __init__(self, *, frames=None):
        self._frames = frames
        self._lock = asyncio.Lock()
        self._identity = 0
        self._closing = self.poisoned = False
        self._active = None

    async def ready(self):
        if self.poisoned or self._closing:
            raise fail()
        if self._frames is None:
            descriptor = None
            try:
                if sys.platform != 'linux':
                    raise fail()
                descriptor = os.open('/dev/hvc1', os.O_RDWR | os.O_NOFOLLOW |
                    os.O_NONBLOCK | os.O_CLOEXEC)
                if not stat.S_ISCHR(os.fstat(descriptor).st_mode):
                    raise fail()
                os.set_inheritable(descriptor, False)
                configure_raw_terminal(descriptor)
                owned, descriptor = descriptor, None
                self._frames = AsyncFdFrames(owned, owned)
            except Exception:
                if descriptor is not None:
                    os.close(descriptor)
                self.poisoned = True
                raise fail() from None
        return self

    async def _poison(self, response=None):
        self.poisoned = True
        try:
            if self._frames is not None:
                await self._frames.aclose()
        finally:
            if response is not None:
                response.cancel()
                try:
                    await drain(response)
                except (Exception, asyncio.CancelledError):
                    pass

    async def _cancel_and_drain(self, identity, op, response):
        try:
            async with asyncio.timeout(10):
                await self._frames.write_frame(encode_request(identity, 'cancel'))
                raw = await asyncio.shield(response)
                if raw is None or decode_response(raw, op)[0] != identity:
                    raise fail()
        except BaseException:
            await self._poison(response)
            raise

    async def request(self, op, raw=b''):
        if type(op) is not str or op not in OPS - {'cancel'}:
            raise fail()
        # Validate before waiting for a slot or opening the character device.
        encode_request(1, op, raw)
        async with self._lock:
            await self.ready()
            if self._identity >= 64:
                raise fail()
            self._identity += 1
            identity, response = self._identity, None
            self._active = asyncio.current_task()
            try:
                async with asyncio.timeout(50 if op == 'generate' else 12):
                    await self._frames.write_frame(encode_request(identity, op, raw))
                    response = asyncio.create_task(self._frames.read_frame())
                    data = await asyncio.shield(response)
                if data is None:
                    raise fail()
                received, status, payload = decode_response(data, op)
                if received != identity:
                    raise fail()
                if status != 'ok':
                    # A complete failed response leaves framing synchronized.
                    raise _RemoteFailure()
                return payload
            except (asyncio.CancelledError, TimeoutError) as error:
                if response is not None:
                    cleanup = asyncio.create_task(self._cancel_and_drain(identity, op, response))
                    try:
                        await drain(cleanup)
                    except (Exception, asyncio.CancelledError):
                        pass
                else:
                    try:
                        await self._poison()
                    except Exception:
                        pass
                if isinstance(error, asyncio.CancelledError) or asyncio.current_task().cancelling():
                    raise asyncio.CancelledError from None
                raise fail() from None
            except _RemoteFailure:
                raise fail() from None
            except Exception:
                await self._poison(response)
                raise fail() from None
            finally:
                self._active = None

    async def aclose(self):
        self._closing = True
        active = self._active
        interrupted = False
        if active is not None and active is not asyncio.current_task():
            active.cancel()
            try:
                _, interrupted = await drain(active)
            except asyncio.CancelledError:
                pass
        if self._frames is not None:
            await self._frames.aclose()
        if interrupted or asyncio.current_task().cancelling():
            raise asyncio.CancelledError


class _RemoteFailure(Exception):
    pass

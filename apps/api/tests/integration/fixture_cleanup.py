"""Owned SDK fixture teardown and safe observations, without service discovery.

The fixture supplies all resource handles and its attested Redis accessor.
Every failure remains an error while independent resources still get cleanup.
"""

import asyncio
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import sys
import time

from cleanup_diagnostics import read_worker_diagnostics, worker_stop_observation


class FixtureCleanupMixin:
    def recorded_groups(self):
        path = self.root / 'workspaces/fixture-processes.jsonl'
        if not path.exists():
            if self.worker is not None:
                raise RuntimeError('Missing owned SDK process record')
            return []
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 8192
                or path.parent.is_symlink() or path.parent.resolve() != self.root / 'workspaces'):
            raise RuntimeError('Unsafe owned SDK process record')
        groups = []
        for line in path.read_text().splitlines():
            item = json.loads(line)
            if (set(item) != {'pid'} or type(item['pid']) is not int or item['pid'] <= 1
                    or item['pid'] in {os.getpid(), os.getpgrp(), self.worker_process.pid}
                    or item['pid'] in groups or len(groups) >= 128):
                raise RuntimeError('Invalid owned SDK process identity')
            groups.append(item['pid'])
        return groups

    def reap_recorded_groups(self):
        # Only after the trusted Worker parent is dead: it cannot add another
        # execution after we read its owned, fsynced bootstrap PID journal.
        if self.worker_process.returncode is None:
            raise RuntimeError('Worker parent is still alive')
        try:
            groups = self.recorded_groups()
        except BaseException as error:
            self.cleanup_diagnostics.record('pid_journal_read', error)
            raise
        for pid in groups:
            def alive():
                try:
                    os.killpg(pid, 0)
                    return True
                except ProcessLookupError:
                    return False
                except PermissionError:
                    self.cleanup_diagnostics.record('sdk_group_probe', category='permission_denied')
                    return True  # Unknown is not absence; only ESRCH confirms.
            def send(signum):
                try:
                    os.killpg(pid, signum)
                    return True
                except ProcessLookupError:
                    return True  # No signal retry is needed for a gone group.
                except PermissionError:
                    self.cleanup_diagnostics.record({signal.SIGTERM: 'sdk_term', signal.SIGCONT: 'sdk_cont',
                                                     signal.SIGKILL: 'sdk_kill'}[signum], category='permission_denied')
                    return False
            if not alive():
                continue
            self.reaped_groups.append(pid)
            term_sent = send(signal.SIGTERM)
            # CONT is independent: a denied TERM must not skip resuming a
            # deliberately stopped SDK. Retry only denied sends, within bounds.
            cont_sent = send(signal.SIGCONT)
            deadline = time.monotonic() + 2
            while alive() and time.monotonic() < deadline:
                if not term_sent:
                    term_sent = send(signal.SIGTERM)
                if not cont_sent:
                    cont_sent = send(signal.SIGCONT)
                time.sleep(.02)
            if alive():
                kill_sent = send(signal.SIGKILL)
                deadline = time.monotonic() + 3
                while alive() and time.monotonic() < deadline:
                    if not kill_sent:
                        kill_sent = send(signal.SIGKILL)
                    time.sleep(.02)
            if alive():
                self.cleanup_diagnostics.record('sdk_group_remains', category='group_present')
                raise RuntimeError('Owned SDK process group remains after KILL')
        return groups

    async def close(self):
        errors = []
        async def attempt(stage, action):
            try:
                return await action()
            except BaseException as error:
                errors.append(error)
                self.cleanup_diagnostics.record(stage, error)
        for stream in self.streams:
            if not stream.task.done():
                await attempt('stream_disconnect', stream.disconnect)
        if self.application:
            await attempt('application_close', self.application.close)
        if self.client:
            await attempt('http_client_close', self.client.aclose)
        if self.worker_process:
            process, stage = self.worker_process, 'worker_stop_input'
            try:
                if process.returncode is None:
                    try:
                        process.stdin.write(b'{"command":"stop"}\n')
                        await process.stdin.drain()
                    except (BrokenPipeError, ConnectionResetError):
                        pass  # It may already be closing from a forwarded TERM.
                if not self.expected_worker_crash:
                    stage = 'worker_stop_ack'
                    self.worker_stopped = worker_stop_observation(await self.worker_line())
                stage = 'worker_wait'
                async with asyncio.timeout(10):
                    await process.wait()
                assert process.returncode == (-(signal.SIGKILL) if self.expected_worker_crash else 0), 'Unexpected Worker exit'
            except BaseException as error:
                errors.append(error)
                self.cleanup_diagnostics.record(stage, error)
                if process.returncode is None:
                    # Each fallback is independent. A denied TERM must not
                    # skip KILL, group reaping or the remaining resource close.
                    async def terminate():
                        process.terminate()
                        async with asyncio.timeout(20):
                            await process.wait()
                    await attempt('worker_force_term', terminate)
                    if process.returncode is None:
                        async def kill():
                            process.kill()
                            async with asyncio.timeout(5):
                                await process.wait()
                        await attempt('worker_force_kill', kill)
            groups = await attempt('sdk_group_remains', lambda: asyncio.to_thread(self.reap_recorded_groups))
            if self.worker_stopped and groups is not None:
                async def check_observation():
                    assert (self.worker_stopped['run_directories_empty'] and self.worker_stopped['journal_clean']
                            and self.worker_stopped['start_count'] == len(groups)
                            and self.worker_stopped['process_group_ids'] == groups and not self.reaped_groups)
                await attempt('worker_observation', check_observation)
            diagnostic_path = self.root / 'workspaces/fixture-cleanup.jsonl'
            if self.worker is not None or diagnostic_path.exists():
                async def read_diagnostics():
                    result = await asyncio.to_thread(read_worker_diagnostics, diagnostic_path.parent)
                    result['acknowledged'] = False
                    self.worker_cleanup_diagnostics = result
                    if not result['complete']:
                        raise ValueError('Invalid diagnostic suffix')
                    if self.worker_stopped:
                        assert (result['complete'] and self.worker_stopped.get('cleanup_diagnostics_complete') is True
                                and type(self.worker_stopped.get('cleanup_diagnostic_count')) is int
                                and self.worker_stopped.get('cleanup_diagnostic_count') == len(result['events']))
                        result['acknowledged'] = True
                    # A dead Worker cannot acknowledge that its entire
                    # diagnostic stream was flushed before the crash.
                await attempt('worker_diagnostics_read', read_diagnostics)
        if self.server:
            self.server.should_exit = True
            async def stop_server():
                try:
                    async with asyncio.timeout(8):
                        await asyncio.shield(self.server_task)
                finally:
                    if not self.server_task.done():
                        self.server_task.cancel()
                        await asyncio.gather(self.server_task, return_exceptions=True)
            await attempt('server_close', stop_server)
        if self.listener:
            await attempt('listener_close', lambda: asyncio.to_thread(self.listener.close))
        if self.pool:
            await attempt('mysql_pool_close', lambda: asyncio.to_thread(self.pool.close))
        if self.admin:
            def drop_mysql():
                try:
                    with self.admin.cursor() as cursor:
                        cursor.execute(f'DROP DATABASE IF EXISTS `{self.database}`')
                finally:
                    self.admin.close()
            await attempt('mysql_drop', lambda: asyncio.to_thread(drop_mysql))
        if self.mongo:
            def drop_mongo():
                try:
                    self.mongo.drop_database(self.database)
                finally:
                    self.mongo.close()
            await attempt('mongo_drop', lambda: asyncio.to_thread(drop_mongo))
        def drop_redis():
            client = self.cleanup_redis()
            keys = list(client.scan_iter(match=self.namespace + '*'))
            if keys:
                assert all(key.startswith(self.namespace) for key in keys)
                client.delete(*keys)
        await attempt('redis_drop', lambda: asyncio.to_thread(drop_redis))
        if not errors:
            await attempt('workspace_remove', lambda: asyncio.to_thread(shutil.rmtree, self.root))
        if errors:
            summary = dict(fixture=self.cleanup_diagnostics.snapshot(), worker=self.worker_cleanup_diagnostics)
            print('SDK cleanup diagnostics ' + json.dumps(summary, allow_nan=False), file=sys.stderr, flush=True)
            # Keep the owned evidence if any process/resource close is unknown.
            raise RuntimeError('SDK stack cleanup is unconfirmed') from errors[0]
        self.cleanup_diagnostics.confirm()
        if self.cleanup_diagnostics.snapshot()['events'] or self.worker_cleanup_diagnostics['events']:
            summary = dict(fixture=self.cleanup_diagnostics.snapshot(), worker=self.worker_cleanup_diagnostics)
            print('SDK cleanup diagnostics ' + json.dumps(summary, allow_nan=False), file=sys.stderr, flush=True)

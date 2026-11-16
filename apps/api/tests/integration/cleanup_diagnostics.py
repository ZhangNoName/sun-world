"""Bounded fixture diagnostics; never serialize exception text or payloads."""

import asyncio
import errno
import json
import os
from pathlib import Path
import re
import stat

LIMIT = 32
MAX_COUNTER = 2_147_483_647
STAGES = frozenset({
    'stream_disconnect', 'application_close', 'http_client_close',
    'worker_stop_input', 'worker_stop_ack', 'worker_wait', 'worker_force_term',
    'worker_force_kill', 'sdk_group_probe', 'sdk_term', 'sdk_cont', 'sdk_kill',
    'sdk_group_remains', 'pid_journal_read', 'worker_observation', 'worker_diagnostics_read',
    'server_close', 'listener_close', 'mysql_pool_close', 'mysql_drop',
    'mongo_drop', 'redis_drop', 'workspace_remove', 'cleanup_complete',
})
CATEGORIES = frozenset({
    'permission_denied', 'group_present', 'io_failed', 'timeout',
    'cancelled', 'invalid_observation', 'unknown', 'none',
})
WORKER_VERSION = 'sun-world-cleanup-diagnostics/1'
WORKER_FIELDS = frozenset({'version', 'run_id', 'execution_id', 'generation', 'sequence', 'operation', 'stage', 'category'})
WORKER_STAGES = frozenset({'group_probe', 'signal_term', 'signal_kill', 'group_present', 'workspace_remove',
                           'containment_stop', 'containment_release', 'recovery_confirmed'})
WORKER_CATEGORIES = frozenset({'permission_denied', 'group_present', 'io_failed', 'unknown', 'none'})
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
MAX_WORKER_BYTES = 65536
MAX_WORKER_LINE_BYTES = 2048


def worker_stop_observation(value):
    fields = {'event', 'start_count', 'run_directories_empty', 'journal_clean', 'process_group_ids',
              'cleanup_diagnostics_complete', 'cleanup_diagnostic_count'}
    if (type(value) is not dict or set(value) != fields or value['event'] != 'stopped'
            or type(value['start_count']) is not int or not 0 <= value['start_count'] <= 128
            or any(type(value[key]) is not bool for key in ('run_directories_empty', 'journal_clean', 'cleanup_diagnostics_complete'))
            or type(value['cleanup_diagnostic_count']) is not int or not 0 <= value['cleanup_diagnostic_count'] <= 4096
            or type(value['process_group_ids']) is not list or len(value['process_group_ids']) != value['start_count']
            or any(type(pid) is not int or not 1 < pid <= MAX_COUNTER for pid in value['process_group_ids'])
            or len(set(value['process_group_ids'])) != len(value['process_group_ids'])):
        raise ValueError('Invalid Worker cleanup observation')
    return {**value, 'process_group_ids': list(value['process_group_ids'])}


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('Duplicate diagnostic field')
        result[key] = value
    return result


def _invalid_constant(_value):
    raise ValueError('Nonfinite diagnostic value')


def read_worker_diagnostics(directory):
    """Return only a validated prefix; invalid/truncated suffix stays private."""
    directory = Path(directory)
    parent = directory.lstat()
    if (not directory.is_absolute() or directory.resolve() != directory or not stat.S_ISDIR(parent.st_mode)
            or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700):
        raise ValueError('Unsafe diagnostic directory')
    descriptor = os.open(directory / 'fixture-cleanup.jsonl', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > MAX_WORKER_BYTES):
            raise ValueError('Unsafe diagnostic file')
        raw = stream.read(MAX_WORKER_BYTES + 1)
    if len(raw) > MAX_WORKER_BYTES:
        raise ValueError('Oversize diagnostic file')
    events, previous, counts = [], {}, {}
    for line in raw.splitlines(keepends=True):
        try:
            if len(line) > MAX_WORKER_LINE_BYTES or not line.endswith(b'\n'):
                raise ValueError('Truncated diagnostic record')
            event = json.loads(line.decode('utf-8'), object_pairs_hook=_pairs, parse_constant=_invalid_constant)
            if type(event) is not dict or set(event) != WORKER_FIELDS or event['version'] != WORKER_VERSION:
                raise ValueError('Invalid diagnostic record')
            if (any(type(event[key]) is not str or not UUID.fullmatch(event[key]) for key in ('run_id', 'execution_id'))
                    or type(event['generation']) is not int or event['generation'] != 1
                    or type(event['sequence']) is not int or not 1 <= event['sequence'] <= MAX_COUNTER
                    or type(event['operation']) is not str or event['operation'] not in {'start', 'finalize', 'stop'}
                    or type(event['stage']) is not str or event['stage'] not in WORKER_STAGES
                    or type(event['category']) is not str or event['category'] not in WORKER_CATEGORIES
                    or (event['stage'] == 'recovery_confirmed') != (event['category'] == 'none')):
                raise ValueError('Invalid diagnostic fields')
            binding = (event['run_id'], event['execution_id'])
            if ((binding not in previous and len(previous) >= 128)
                    or event['sequence'] <= previous.get(binding, 0) or counts.get(binding, 0) >= LIMIT):
                raise ValueError('Diagnostic order or count exceeded')
            previous[binding], counts[binding] = event['sequence'], counts.get(binding, 0) + 1
            events.append(event)
        except (UnicodeError, ValueError, TypeError, RecursionError):
            return dict(events=events, complete=False)
    return dict(events=events, complete=True)


def error_category(error):
    if isinstance(error, PermissionError):
        return 'permission_denied'
    if isinstance(error, asyncio.CancelledError):
        return 'cancelled'
    if isinstance(error, TimeoutError):
        return 'timeout'
    if isinstance(error, (AssertionError, ValueError)):
        return 'invalid_observation'
    if isinstance(error, OSError):
        try:
            code = error.errno
        except BaseException:
            return 'unknown'
        return 'permission_denied' if type(code) is int and code in {errno.EPERM, errno.EACCES} else 'io_failed'
    return 'unknown'


class CleanupDiagnostics:
    def __init__(self):
        self._events = []
        self._dropped = 0
        self._confirmed = False

    def record(self, stage, error=None, *, category=None):
        if type(stage) is not str or stage not in STAGES:
            raise ValueError('Invalid cleanup diagnostic stage')
        category = error_category(error) if category is None else category
        if type(category) is not str or category not in CATEGORIES:
            raise ValueError('Invalid cleanup diagnostic category')
        if category != 'none':
            self._confirmed = False
        if len(self._events) >= LIMIT:
            self._dropped = min(MAX_COUNTER, self._dropped + 1)
            return
        self._events.append(dict(sequence=len(self._events) + 1, stage=stage, category=category))

    def confirm(self):
        self._confirmed = True
        if self._events:
            self.record('cleanup_complete', category='none')

    def snapshot(self):
        return dict(version='sun-world-fixture-cleanup/1', cleanup_confirmed=self._confirmed,
                    dropped_count=self._dropped, events=[dict(event) for event in self._events])

"""Explicit Mac synthetic API SIGKILL matrix, invoked by the owned launcher."""

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import sys
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(Path(__file__).parent))
from api_process_fixture import ProcessFixture, stack
from api_process_host import ERROR, fail
from src.modules.agent_runtime.cleanup import finish_cleanup
from src.modules.agent_runtime.rpc import PROTOCOL

BUDGET = ('tool_count', 'model_count', 'model_input_bytes', 'model_input_tokens_reserved',
    'model_output_tokens_reserved', 'model_response_bytes_reserved', 'model_input_tokens_observed',
    'model_output_tokens_observed', 'model_response_bytes_observed', 'model_usage_unknown_count', 'result_bytes')


def require(value):
    if value is not True:
        raise fail()


class Report:
    def __init__(self, path, *, linux=False):
        if type(linux) is not bool:
            raise fail()
        path = Path(path)
        parent = path.parent.lstat()
        if (not path.is_absolute() or path.parent.resolve() != path.parent
                or not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
                or stat.S_IMODE(parent.st_mode) != 0o700):
            raise fail()
        self.path = path
        self.fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            self.identity = os.fstat(self.fd)
        except BaseException:
            os.close(self.fd)
            raise
        self.value = {'version': 'sun-world-api-process-recovery/1', 'passed': False,
            'platform': 'linux-cgroup-bubblewrap' if linux else 'macos-sandbox',
            'linux_verified': False, 'cases': []}

    def save(self):
        raw = json.dumps(self.value, allow_nan=False, separators=(',', ':')).encode()
        info = self.path.lstat()
        if (len(raw) > 32768 or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600
                or (info.st_dev, info.st_ino) != (self.identity.st_dev, self.identity.st_ino)):
            raise fail()
        os.lseek(self.fd, 0, os.SEEK_SET)
        written = 0
        while written < len(raw):
            size = os.write(self.fd, raw[written:])
            if size <= 0:
                raise fail()
            written += size
        os.ftruncate(self.fd, len(raw))
        os.fsync(self.fd)

    def close(self):
        os.close(self.fd)


def observation(cut):
    return dict(cut=cut, passed=False, api_sigkill_confirmed=False, worker_survived=False,
        restart_ready=False, idempotency_preserved=False, budget_preserved=False,
        history_preserved=False, old_callback_rejected=None, deadline_reconciled=None,
        redis_lease_retained=None, completed_quiescent_before_kill=None,
        callback_lease_remaining_ms=None, terminal_elapsed_ms=None,
        budget_mode='synthetic-reservation-only', model_count_before=None, model_count_after=None,
        cleanup_confirmed=False, failure_stage='prepare', error_type=None, child_failure=None,
        linux_observation=None, worker_start_count=None, worker_acknowledged=False)


def safe_error_type(error):
    for kind, name in ((asyncio.CancelledError, 'CancelledError'), (TimeoutError, 'TimeoutError'),
            (httpx.HTTPError, 'HTTPError'), (AssertionError, 'AssertionError'),
            (ValueError, 'ValueError'), (RuntimeError, 'RuntimeError')):
        if isinstance(error, kind):
            return name
    return 'OtherError'


def worker_observation(fixture, record):
    stopped = fixture.worker_stopped
    record['worker_start_count'] = stopped['start_count'] if stopped is not None else None
    diagnostics = fixture.worker_cleanup_diagnostics
    record['worker_acknowledged'] = (stopped is not None
        and diagnostics['complete'] is True and diagnostics['acknowledged'] is True)


async def exercise(fixture, record):
    cut = fixture.cut
    record['failure_stage'] = 'sse'
    stream = stack.Stream(fixture)
    if cut == 'accepted':
        record['failure_stage'] = 'accepted_commit'
        event = await fixture.wait_event('accepted')
        run_id = event['run_id']
        committed = fixture.pool.fetch_one('SELECT * FROM agent_runs WHERE idempotency_key=%s', (stream.key,))
        require(committed is not None and committed['id'] == run_id and committed['status'] == 'accepted'
            and committed['execution_id'] is None and committed['model_count'] == 0)
    else:
        run_id = await stream.run_id()
        if cut == 'model_hold':
            record['failure_stage'] = 'model_hold'
            await fixture.wait_event('model_hold')
            require(fixture.callback is not None)
        else:
            record['failure_stage'] = 'completed_quiescence'
            await stream.finish()
            async with asyncio.timeout(10):
                while stack.AgentStackTests.redis.exists(fixture.namespace + ':slot:user:1'):
                    await asyncio.sleep(.05)
            await fixture.quiet(run_id)
            record['completed_quiescent_before_kill'] = True
    record['failure_stage'] = 'snapshot'
    before = await asyncio.to_thread(fixture.row, run_id)
    calls = fixture.pool.fetch_all('SELECT * FROM agent_model_calls ORDER BY call_id')
    messages = fixture.pool.fetch_all('SELECT * FROM ai_messages ORDER BY id')
    sources = fixture.pool.fetch_all('SELECT * FROM agent_sources ORDER BY source_id')
    rate = stack.AgentStackTests.redis.get(fixture.namespace + ':rate:global')
    require(rate == '1')
    require(before['status'] == {'accepted': 'accepted', 'model_hold': 'running', 'completed': 'completed'}[cut])
    require(before['model_count'] == {'accepted': 0, 'model_hold': 1, 'completed': 3}[cut])
    require(before['tool_count'] == {'accepted': 0, 'model_hold': 0, 'completed': 2}[cut])
    require(len(messages) == (2 if cut == 'completed' else 1))
    require(before['model_input_tokens_reserved'] == 0)  # Synthetic proxy has no official preflight.
    require(len(calls) == before['model_count'])
    require(sum(call['input_bytes'] for call in calls) == before['model_input_bytes'])
    require(sum(call['reserved_output_tokens'] for call in calls) == before['model_output_tokens_reserved'])
    require(sum(call['reserved_response_bytes'] for call in calls) == before['model_response_bytes_reserved'])
    if cut == 'model_hold':
        require(before['model_output_tokens_reserved'] == 1024 and before['model_response_bytes_reserved'] == 65536
            and before['model_input_bytes'] > 0 and calls[0]['state'] == 'reserved'
            and all(calls[0][key] is None for key in ('input_tokens', 'output_tokens', 'response_bytes',
                'reserved_input_tokens', 'result_hash', 'wire_request_hash', 'count_request_hash')))
    elif cut == 'completed':
        require(len(calls) == 3 and all(call['state'] == 'observed' and call['input_tokens'] == 20
            and call['output_tokens'] == 20 and call['response_bytes'] > 0 for call in calls))
    record['model_count_before'] = before['model_count']
    original_view = await fixture.request('GET', '/runs/' + run_id)
    require(original_view.status_code == 200)
    worker = fixture.worker_process
    record['failure_stage'] = 'api_sigkill'
    await fixture.kill_api()
    record['api_sigkill_confirmed'] = fixture.api_sigkills == 1
    record['worker_survived'] = worker is fixture.worker_process and worker.returncode is None
    await stream.disconnect()  # Old socket died; never treat it as a successful SSE.
    record['failure_stage'] = 'api_restart'
    await fixture.restart_api()
    record['restart_ready'] = fixture.api_process.returncode is None
    require(fixture.application is None and fixture.server is None)
    if cut == 'model_hold':
        record['failure_stage'] = 'callback_session'
        callback = fixture.callback
        row = await asyncio.to_thread(fixture.row, run_id)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        remaining = (row['lease_expires_at'] - now).total_seconds()
        require(row['status'] == 'running' and row['deadline'] > now and remaining > 0)
        require(hashlib.sha256(callback['token'].encode('ascii')).hexdigest() == row['model_credential_hash']
            and callback['service'] == fixture.gateway_secret
            and callback['run_id'] == run_id and callback['execution_id'] == row['execution_id'])
        denied = await fixture.client.post('/internal/agent/v2/runs/' + run_id + '/model/messages',
            headers={'x-agent-protocol': PROTOCOL, 'x-agent-execution': callback['execution_id'],
                'x-agent-generation': '1', 'authorization': 'Bearer ' + callback['token'],
                'x-worker-service': callback['service']}, json={})
        require(denied.status_code == 403 and denied.json() == {'detail': 'AGENT_ACTIVE_SESSION_REQUIRED'})
        after_denied = await asyncio.to_thread(fixture.row, run_id)
        require(after_denied['status'] == 'running' and after_denied['lease_expires_at'] > datetime.now(timezone.utc).replace(tzinfo=None)
            and after_denied['model_credential_hash'] == row['model_credential_hash'])
        record['callback_lease_remaining_ms'] = int(remaining * 1000)
        record['old_callback_rejected'] = True
    record['failure_stage'] = 'idempotency'
    duplicate = await fixture.request('POST', '/runs/stream',
        json={'question': stack.QUESTION, 'idempotency_key': stream.key})
    require(duplicate.status_code == 409 and duplicate.json()['data']['run_id'] == run_id)
    require(fixture.pool.fetch_one('SELECT COUNT(*) n FROM agent_runs')['n'] == 1)
    record['idempotency_preserved'] = True
    record['failure_stage'] = 'recovered_view'
    recovered = await fixture.request('GET', '/runs/' + run_id)
    require(recovered.status_code == 200)
    if cut == 'completed':
        require(recovered.json()['data'] == original_view.json()['data'])
        require(not stack.AgentStackTests.redis.exists(fixture.namespace + ':slot:user:1'))
    else:
        record['failure_stage'] = 'reconcile'
        require(stack.AgentStackTests.redis.exists(fixture.namespace + ':slot:user:1') == 1)
        async with asyncio.timeout(50):
            while True:
                row = await asyncio.to_thread(fixture.row, run_id)
                if row['status'] in ('failed', 'interrupted'):
                    break
                await asyncio.sleep(.1)
        expected = 'failed' if cut == 'accepted' else 'interrupted'
        require(row['status'] == expected)
        boundary = before['deadline'] if cut == 'accepted' else before['lease_expires_at']
        require(row['ended_at'] >= boundary)
        require(stack.AgentStackTests.redis.exists(fixture.namespace + ':slot:user:1') == 1)
        record['redis_lease_retained'] = True
        record['deadline_reconciled'] = True
        record['terminal_elapsed_ms'] = int((row['ended_at'] - row['accepted_at']).total_seconds() * 1000)
        if cut == 'model_hold':
            await fixture.quiet(run_id)
    record['failure_stage'] = 'budget'
    after = await asyncio.to_thread(fixture.row, run_id)
    require(all(before[key] == after[key] for key in BUDGET))
    require(fixture.pool.fetch_all('SELECT * FROM agent_model_calls ORDER BY call_id') == calls)
    require(fixture.pool.fetch_all('SELECT * FROM ai_messages ORDER BY id') == messages
        and fixture.pool.fetch_all('SELECT * FROM agent_sources ORDER BY source_id') == sources)
    require(stack.AgentStackTests.redis.get(fixture.namespace + ':rate:global') == rate)
    require(len(fixture.recorded_groups()) == (0 if cut == 'accepted' else 1))
    record['model_count_after'] = after['model_count']
    record['budget_preserved'] = record['history_preserved'] = True


async def run_matrix(report, *, linux=False):
    if type(linux) is not bool or sys.platform != ('linux' if linux else 'darwin'):
        raise fail()
    stack.AgentStackTests.setUpClass()
    try:
        for cut in ('accepted', 'model_hold', 'completed'):
            record = observation(cut)
            report.value['cases'].append(record)
            report.save()
            kind = ProcessFixture
            expected_executions = 0 if cut == 'accepted' else 1
            if linux:
                from linux_sdk_stack import linux_fixture_class
                kind = linux_fixture_class(ProcessFixture, execution_count=expected_executions)
            fixture = kind(cut)
            failed = False
            try:
                await fixture.start()
                await exercise(fixture, record)
            except asyncio.CancelledError as error:
                failed = True
                record['error_type'] = safe_error_type(error)
                raise
            except Exception as error:
                failed = True
                record['error_type'] = safe_error_type(error)
            finally:
                try:
                    await finish_cleanup(fixture.close())
                    record['cleanup_confirmed'] = (not fixture.root.exists()
                        and fixture.api_cleanup_confirmed()
                        and (fixture.worker_process is None or fixture.worker_process.returncode == 0))
                    worker_observation(fixture, record)
                    if not failed:
                        require(record['worker_acknowledged'] and type(record['worker_start_count']) is int
                            and record['worker_start_count'] == expected_executions)
                    if linux:
                        record['linux_observation'] = fixture.linux_summary()
                        summary = record['linux_observation']
                        require(summary['executions'] == expected_executions
                            and summary['model_requests'] == {'accepted': 0, 'model_hold': 1, 'completed': 3}[cut]
                            and summary['tool_calls'] == {'accepted': 0, 'model_hold': 0, 'completed': 2}[cut])
                except BaseException as error:
                    record['cleanup_confirmed'] = False
                    if record['error_type'] is None:
                        record['failure_stage'], record['error_type'] = 'cleanup', safe_error_type(error)
                worker_observation(fixture, record)
                record['passed'] = not failed and record['cleanup_confirmed']
                record['child_failure'] = fixture.child_failure
                if record['passed']:
                    record['failure_stage'] = None
                report.save()
            if not record['cleanup_confirmed']:
                raise fail()  # Do not create more resources after unknown cleanup.
        report.value['passed'] = len(report.value['cases']) == 3 and all(row['passed'] for row in report.value['cases'])
        report.value['linux_verified'] = linux and report.value['passed']
        report.save()
        require(report.value['passed'])
    finally:
        stack.AgentStackTests.tearDownClass()


def main():
    class Parser(argparse.ArgumentParser):
        def error(self, _message):
            raise fail()
    report, linux, code = None, False, 1
    try:
        parser = Parser(allow_abbrev=False)
        parser.add_argument('--report', type=Path, required=True)
        parser.add_argument('--linux-stack', action='store_true')
        options = parser.parse_args()
        linux = options.linux_stack
        if sys.platform != ('linux' if linux else 'darwin'):
            raise fail()
        report = Report(options.report, linux=linux)
        report.save()
        async def owned():
            task = asyncio.current_task()
            loop = asyncio.get_running_loop()
            for signum in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(signum, task.cancel)
            try:
                await run_matrix(report, linux=linux)
            finally:
                for signum in (signal.SIGINT, signal.SIGTERM):
                    loop.remove_signal_handler(signum)
        asyncio.run(owned())
        code = 0
    except (KeyboardInterrupt, asyncio.CancelledError):
        code = 130
    except BaseException:
        print(ERROR, file=sys.stderr)
    finally:
        if report:
            try:
                report.close()
            except Exception:
                if code != 130:
                    code = 1
                print(ERROR, file=sys.stderr)
    if code == 0 and linux:
        print('SW_LINUX_API_PROCESS_RESULT ' + json.dumps(report.value, allow_nan=False, separators=(',', ':')), flush=True)
    return code


if __name__ == '__main__':
    sys.exit(main())

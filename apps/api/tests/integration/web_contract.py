"""Capture actual formal routes over mTLS, with synthetic articles/model only."""

import argparse
import asyncio
import json
import os
from pathlib import Path
import signal
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(Path(__file__).parent))
import sdk_stack as stack
from model_evaluation import create_report
from src.modules.agent_runtime.cleanup import finish_cleanup

PUBLIC_ORIGIN = 'https://sunworld.site'


class WebFixture(stack.Fixture):
    def rebuild_application(self):
        # A browser public site is distinct from this test's private mTLS
        # callback listener. Fix the origin at construction, never rewrite JSON.
        self.application = stack.create_blog_qa_application(self.pool, stack.ContentMongo(self.mongo[self.database]),
            auth_manager=self.auth, redis_client=stack.AgentStackTests.redis, worker=self.worker,
            model_proxy=self.model, worker_credential=self.gateway_secret, bundle_hash=self.bundle_hash,
            model_id=self.model_id, site_origin=PUBLIC_ORIGIN, user_ids=[1], enabled=lambda: True,
            admission_namespace=self.namespace)
        host = stack.FastAPI()
        host.include_router(stack.create_public_run_router(self.application, allowed_origins=[self.origin]))
        host.include_router(stack.create_private_run_router(self.application.gateway,
            verify_peer=lambda request: request.scope.get('sunworld.test.tls_peer_sha256') == self.peer))
        self.host.target = host


def response_value(response):
    assert response.status_code == 200
    value = response.json()
    assert type(value) is dict and value['code'] == 1
    return {'status': response.status_code, 'body': value}


def save(output, value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n'
    assert len(raw.encode()) <= 65536
    output.seek(0)
    output.write(raw)
    output.truncate()
    output.flush()
    os.fsync(output.fileno())


async def capture(output):
    report = dict(version='sun-world-formal-web-contract/1', passed=False,
        data_kind='synthetic-public-articles-and-model', public_site_origin=PUBLIC_ORIGIN,
        sdk_version='0.2.2-rc.1', supplier_requests=0, cases=[])
    save(output, report)  # Before resource allocation; a failed write is not a pass.
    stack.AgentStackTests.setUpClass()
    try:
        for label, mode in (('completed', 'complete'), ('cancelled', 'hold')):
            fixture = WebFixture(mode)
            row = dict(case=label, cleanup_confirmed=False)
            report['cases'].append(row)
            try:
                await fixture.start()
                row['capabilities'] = response_value(await fixture.request('GET', '/capabilities'))
                row['anonymous_capabilities'] = response_value(await fixture.client.get('/ai/v1/blog-qa/capabilities'))
                assert row['capabilities']['body']['data']['mode'] == 'formal'
                assert row['capabilities']['body']['data']['authenticated'] is True
                assert row['anonymous_capabilities']['body']['data']['authenticated'] is False
                stream = stack.Stream(fixture)
                run_id = await stream.run_id()
                if label == 'cancelled':
                    await asyncio.wait_for(fixture.model_started.wait(), 15)
                    row['cancel'] = response_value(await fixture.request('POST', '/runs/' + run_id + '/cancel', json={}))
                await stream.finish()
                durable = await fixture.settled(run_id, terminal=label)
                row['events'] = stream.events
                row['get'] = response_value(await fixture.request('GET', '/runs/' + run_id))
                if label == 'completed':
                    row['cancel'] = response_value(await fixture.request('POST', '/runs/' + run_id + '/cancel', json={}))
                state = row['get']['body']['data']
                assert state['status'] == label and row['cancel']['body']['data'] == state
                assert stream.events[-1]['data'] == state
                assert state['sources'] == ([] if label == 'cancelled' else [dict(article_id=1, title='权限检查', url=PUBLIC_ORIGIN + '/blog/1')])
                assert durable['model_count'] == (3 if label == 'completed' else 1)
                row['model_count'] = durable['model_count']
            finally:
                await finish_cleanup(fixture.close())
                row['cleanup_confirmed'] = not fixture.root.exists()
                row['worker_acknowledged'] = fixture.worker_stopped is not None and fixture.worker_cleanup_diagnostics['acknowledged']
                row['sdk_start_count'] = fixture.worker_stopped['start_count'] if fixture.worker_stopped else None
                save(output, report)
            assert row['cleanup_confirmed'] and row['worker_acknowledged'] and row['sdk_start_count'] == 1
        report['passed'] = True
        save(output, report)
    finally:
        stack.AgentStackTests.tearDownClass()


def main():
    class Parser(argparse.ArgumentParser):
        def error(self, _message):
            self.exit(2, 'AGENT_WEB_CONTRACT_FAILED\n')
    parser = Parser(allow_abbrev=False)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    async def owned(output):
        task, loop = asyncio.current_task(), asyncio.get_running_loop()
        for number in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(number, task.cancel)
        await capture(output)
    try:
        if sys.platform != 'darwin':
            raise RuntimeError('AGENT_WEB_CONTRACT_FAILED')
        with create_report(args.report) as output:
            asyncio.run(owned(output))
        return 0
    except (KeyboardInterrupt, asyncio.CancelledError):
        return 130
    except Exception:
        print('AGENT_WEB_CONTRACT_FAILED', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class AiRunMetricsTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_and_stream_failure_are_counted_without_content(self):
        from src.modules.ai.run_metrics import AiRunMetrics, observe_run
        metrics = AiRunMetrics()
        async def events(terminal):
            yield SimpleNamespace(type='content.delta', data={'delta': 'private'})
            yield SimpleNamespace(type=terminal, data={})
        with patch('src.modules.ai.run_metrics.audit_log.record') as audit:
            completed = [
                event async for event in observe_run(events('message.completed'), metrics)
            ]
            failed = [event async for event in observe_run(events('run.failed'), metrics)]
        self.assertGreaterEqual(completed[-1].data['duration_ms'], 0)
        self.assertEqual(failed[-1].data, {})
        result = metrics.snapshot()
        self.assertEqual((result.started, result.completed, result.failed, result.active), (2, 1, 1, 0))
        self.assertNotIn('private', str(audit.call_args_list))

    async def test_explicit_close_cleans_up_provider_and_counts_cancel(self):
        from src.modules.ai.run_metrics import AiRunMetrics, observe_run
        metrics = AiRunMetrics()
        closed = []
        async def events():
            try:
                yield SimpleNamespace(type='run.started')
                await asyncio.sleep(100)
            finally:
                closed.append(True)
        with patch('src.modules.ai.run_metrics.audit_log.record'):
            stream = observe_run(events(), metrics)
            await anext(stream)
            self.assertEqual(metrics.snapshot().active, 1)
            await stream.aclose()
        self.assertEqual(closed, [True])
        self.assertEqual((metrics.snapshot().active, metrics.snapshot().cancelled), (0, 1))

    def test_storage_is_bounded(self):
        from src.modules.ai.run_metrics import AiRunMetrics
        metrics = AiRunMetrics()
        for i in range(600):
            metrics.start()
            metrics.finish('completed', i)
        result = metrics.snapshot()
        self.assertEqual(result.sample_count, 500)
        self.assertEqual(result.p95_duration_ms, 574)

    def test_request_id_search_reaches_rotated_logs(self):
        from src.core.audit_log import AuditLogService
        with tempfile.TemporaryDirectory() as directory:
            log = AuditLogService(log_dir=directory, max_file_bytes=512, max_files=3)
            log.record('ai_run_failed', request_id='wanted')
            for i in range(4):
                log.record('request_completed', request_id=str(i))
            result = log.list_events(limit=1, request_id='wanted')
            self.assertEqual(len(result['events']), 1)
            self.assertEqual(result['events'][0]['request_id'], 'wanted')

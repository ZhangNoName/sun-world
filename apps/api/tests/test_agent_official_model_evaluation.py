"""Offline evaluation wiring/projection tests. No SDK, database or provider IO."""

import asyncio
from contextlib import nullcontext, redirect_stderr, redirect_stdout
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

import httpx
from fastapi import APIRouter

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
import model_evaluation as evaluation
import sdk_stack as stack
from src.modules.ai import local_openai
from src.modules.ai.openai_responses import OpenAiResponsesProxy
from src.modules.ai.providers import ProviderConfig
from src.modules.ai.public import is_counted_model_proxy

PRIVATE = 'SYNTHETIC_PRIVATE_REPORT_FIELD_OR_DIAGNOSTIC'


def run_row():
    return dict(generation=1, model_count=2, tool_count=2, model_input_bytes=200,
        model_output_tokens_reserved=2048, model_response_bytes_reserved=131072,
        model_input_tokens_reserved=30, model_input_tokens_observed=30,
        model_output_tokens_observed=9, model_response_bytes_observed=220, model_usage_unknown_count=0)


def call_rows():
    return [dict(state='observed', input_bytes=100, reserved_output_tokens=1024,
        reserved_response_bytes=65536, reserved_input_tokens=tokens, input_tokens=tokens,
        output_tokens=output, response_bytes=size, wire_request_hash='a' * 64, count_request_hash='b' * 64)
        for tokens, output, size in ((10, 4, 100), (20, 5, 120))]


def load_cli():
    spec = importlib.util.spec_from_file_location('official_sdk_cli_test', ROOT / 'scripts/test-agent-sdk-stack.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OfficialEvaluationOptionsTests(unittest.TestCase):
    def test_pure_helper_never_treats_invalid_falsey_profiles_as_default(self):
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='test'):
            self.assertEqual('qwen-public', evaluation.validate_options(True, Path('/synthetic.json')))
            for profile in ('', False, 0):
                with self.assertRaises(ValueError):
                    evaluation.validate_options(True, Path('/synthetic.json'), profile)

    def test_cli_combinations_and_production_refuse_before_resources(self):
        cli = load_cli()
        base = sum(([f'--{name}', '/synthetic-missing'] for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node')), [])
        combinations = [['--real-model-profile', 'openai-local'], ['--report', '/synthetic.json'],
            ['--real-model'], ['--real-model', '--report', '/synthetic.json', '--interrupt-probe']]
        with patch.object(cli, 'load') as loader, patch.object(cli.subprocess, 'check_output') as execute:
            for flags in combinations:
                with redirect_stderr(io.StringIO()):
                    self.assertEqual(1, cli.main(base + flags))
            with patch.dict(os.environ, BLOG_RUNTIME_ENV='production'), redirect_stderr(io.StringIO()):
                self.assertEqual(1, cli.main(base + ['--real-model', '--report', '/synthetic.json',
                    '--real-model-profile', 'openai-local']))
            loader.assert_not_called()
            execute.assert_not_called()

    def test_cli_explicit_official_and_legacy_default_forward_only_fixed_profiles(self):
        cli = load_cli()
        with tempfile.TemporaryDirectory(prefix='sun-world-eval-cli-') as directory:
            root = Path(directory)
            node = root / 'node'
            node.write_text('synthetic executable is never run')
            base = ['--mysqld', '/synthetic', '--redis-server', '/synthetic', '--mongod', '/synthetic',
                '--node', str(node), '--sdk-runtime', str(root)]
            mysql = SimpleNamespace(run=Mock(return_value=0))
            redis = SimpleNamespace(owned_redis=lambda _: nullcontext({'REDIS_OWNED_SYNTHETIC': '1'}))
            mongo = SimpleNamespace(owned_mongo=lambda _: nullcontext({'MONGO_OWNED_SYNTHETIC': '1'}))
            for flags, expected in (([], None), (['--real-model', '--report', str(root / 'qwen.json')], 'qwen-public'),
                    (['--real-model', '--report', str(root / 'openai.json'), '--real-model-profile', 'openai-local'], 'openai-local')):
                with patch.dict(os.environ, BLOG_RUNTIME_ENV='test'), patch.object(cli, 'load', side_effect=[mysql, redis, mongo]), \
                        patch.object(cli.subprocess, 'check_output', return_value='v' + (ROOT / '.nvmrc').read_text().strip()):
                    self.assertEqual(0, cli.main(base + flags))
                command = mysql.run.call_args.kwargs['test_command']
                self.assertEqual(expected is not None, '--real-model' in command)
                if expected:
                    self.assertEqual(expected, command[command.index('--real-model-profile') + 1])
                else:
                    self.assertNotIn('--real-model-profile', command)


class JournalProjectionTests(unittest.TestCase):
    def test_official_observed_projection_verifies_counts_and_bounded_totals(self):
        evidence = evaluation.budget_evidence(run_row(), call_rows(), official=True)
        self.assertTrue(evidence['budget_projection_valid'])
        self.assertTrue(all(evidence['checks'].values()))
        self.assertEqual(set(evaluation.CALL_FIELDS), set(evidence['model_calls'][0]))

    def test_invalid_values_and_unknown_journal_names_never_enter_report(self):
        faults = [('input_tokens', True), ('input_tokens', -1), ('reserved_input_tokens', 16385),
            ('reserved_input_tokens', 0), ('output_tokens', 1025), ('response_bytes', float('nan')),
            ('wire_request_hash', PRIVATE), ('count_request_hash', 'G' * 64), ('state', PRIVATE), (PRIVATE, PRIVATE)]
        for key, value in faults:
            rows = call_rows()
            rows[0][key] = value
            evidence = evaluation.budget_evidence(run_row(), rows, official=True)
            self.assertFalse(evidence['budget_projection_valid'])
            self.assertFalse(all(evidence['checks'].values()))
            self.assertNotIn(PRIVATE, json.dumps(evidence, allow_nan=False))
        run = run_row()
        run.update(model_count=True, model_input_tokens_observed={PRIVATE: PRIVATE}, **{PRIVATE: PRIVATE})
        evidence = evaluation.budget_evidence(run, call_rows(), official=True)
        self.assertFalse(evidence['budget_projection_valid'])
        self.assertNotIn(PRIVATE, json.dumps(evidence))

    def test_missing_unknown_unobserved_and_usage_drift_cannot_verify(self):
        cases = [[], call_rows()[:1]]
        for state in ('reserved', 'unknown'):
            rows = call_rows()
            rows[0].update(state=state, input_tokens=None, output_tokens=None, response_bytes=None)
            cases.append(rows)
        rows = call_rows()
        rows[0]['input_tokens'] = 11
        cases.append(rows)
        rows = call_rows()
        rows[0]['count_request_hash'] = None
        cases.append(rows)
        for rows in cases:
            evidence = evaluation.budget_evidence(run_row(), rows, official=True)
            self.assertFalse(all(evidence['checks'].values()))
        run = run_row()
        run['model_input_tokens_reserved'] += 1
        self.assertFalse(evaluation.budget_evidence(run, call_rows(), official=True)['checks']['model_run_input_matches'])

    def test_call_input_bytes_must_match_run_and_stay_within_the_run_limit(self):
        run = run_row()
        run['model_input_bytes'] = 0
        evidence = evaluation.budget_evidence(run, call_rows(), official=True)
        self.assertFalse(evidence['checks']['model_run_input_bytes_match'])
        self.assertFalse(all(evidence['checks'].values()))
        calls = [dict(call_rows()[0], input_bytes=131072) for _ in range(4)]
        run.update(model_count=4, model_output_tokens_reserved=4096, model_response_bytes_reserved=262144,
            model_input_tokens_reserved=40, model_input_tokens_observed=40,
            model_output_tokens_observed=16, model_response_bytes_observed=400)
        evidence = evaluation.budget_evidence(run, calls, official=True)
        self.assertTrue(evidence['budget_projection_valid'])
        self.assertTrue(evidence['checks']['model_run_input_matches'])
        self.assertFalse(evidence['checks']['model_run_input_bytes_match'])
        self.assertFalse(all(evidence['checks'].values()))


class FixtureWiringTests(unittest.TestCase):
    def test_official_factory_and_rebuild_preserve_the_original_counted_instance(self):
        selected = OpenAiResponsesProxy(ProviderConfig(provider='openai-local', model='gpt-6.1-sol',
            base_url='https://api.openai.com/v1', auth_mode='bearer', api_key='sk-synthetic_unit_only'))
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='test'), \
                patch.object(local_openai, 'create_local_openai_proxy', return_value=selected):
            fixture = stack.Fixture('real', real_model_profile='openai-local')
        self.addCleanup(shutil.rmtree, fixture.root)
        fixture.pool, fixture.mongo = object(), {fixture.database: object()}
        fixture.auth, fixture.worker, fixture.bundle_hash = object(), object(), 'a' * 64
        fixture.origin, fixture.peer = 'https://localhost:1', 'b' * 64
        application = SimpleNamespace(gateway=object())
        with patch.object(stack, 'create_blog_qa_application', return_value=application) as factory, \
                patch.object(stack, 'create_public_run_router', return_value=APIRouter()), \
                patch.object(stack, 'create_private_run_router', return_value=APIRouter()), \
                patch.object(stack.AgentStackTests, 'redis', object(), create=True):
            fixture.rebuild_application()
        self.assertIs(selected, factory.call_args.kwargs['model_proxy'])
        self.assertTrue(is_counted_model_proxy(factory.call_args.kwargs['model_proxy']))
        self.assertEqual([], fixture.model_trace)

    def test_production_refuses_official_before_factory_or_fixture_directory(self):
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='production'), \
                patch.object(local_openai, 'create_local_openai_proxy') as factory, \
                patch.object(stack.tempfile, 'mkdtemp') as directory:
            with self.assertRaises(ValueError):
                stack.Fixture('real', real_model_profile='openai-local')
        factory.assert_not_called()
        directory.assert_not_called()


class EvaluationReportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='sun-world-eval-report-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / 'tool-catalog.json').write_text(json.dumps({'product_skills': [
            {'id': 'blog-qa', 'version': '2', 'content_sha256': 'c' * 64}]}))
        (self.root / 'profile.mjs').write_text('// synthetic offline artifact')
        self.report = self.root / 'report.json'
        self.fixtures = []
        runtime = patch.dict(os.environ, BLOG_RUNTIME_ENV='test')
        runtime.start()
        self.addCleanup(runtime.stop)

    def factories(self, *, fail=None, read_error=False, cleanup_error=False):
        owner = self
        class Pool:
            def __init__(self, fixture):
                self.fixture = fixture
            def fetch_all(self, sql, params=()):
                if self.fixture.closed:
                    raise AssertionError('Read after close')
                if read_error:
                    raise OSError(PRIVATE)
                return [{'id': self.fixture.run_id}] if sql.startswith('SELECT id ') else call_rows()
        class Fixture:
            def __init__(self, mode, *, case, real_model_profile):
                self.case, self.profile, self.model_trace = case, real_model_profile, []
                self.runtime, self.bundle_hash, self.model_id = owner.root, 'a' * 64, 'gpt-6.1-sol'
                self.run_id, self.closed = str(uuid4()), False
                self.pool = Pool(self)
                self.worker_stopped, self.worker_cleanup_diagnostics = None, {'events': []}
                self.cleanup_diagnostics = SimpleNamespace(snapshot=lambda: {'events': [], 'cleanup_confirmed': True})
                owner.fixtures.append(self)
            async def start(self):
                pass
            async def settled(self, run_id):
                return run_row()
            def row(self, run_id):
                return run_row()
            async def request(self, *args):
                answer = ' '.join(group[0] for group in self.case['required_fact_groups'])
                return httpx.Response(200, json={'data': {'status': 'completed', 'answer': answer,
                    'sources': [{'article_id': identity} for identity in self.case['expected_article_ids']]}})
            async def close(self):
                self.closed = True
                if cleanup_error:
                    raise RuntimeError(PRIVATE)
        class Stream:
            def __init__(self, fixture, *, question):
                self.fixture = fixture
            async def run_id(self):
                if fail == 'started':
                    raise RuntimeError(PRIVATE)
                return self.fixture.run_id
            async def finish(self):
                if fail == 'finish':
                    raise RuntimeError('AGENT_MODEL_TIMEOUT')
        return Fixture, Stream

    async def evaluate(self, **faults):
        fixture, stream = self.factories(**faults)
        with redirect_stdout(io.StringIO()):
            await evaluation.evaluate_real_model(self.report, profile='openai-local',
                fixture_factory=fixture, stream_factory=stream, root=ROOT)

    async def test_official_report_is_ledger_only_and_tokenizer_and_human_stay_unverified(self):
        await self.evaluate()
        report = json.loads(self.report.read_text())
        self.assertEqual('ledger-only', report['model_trace_mode'])
        self.assertTrue(report['provider_input_budget_verified'])
        self.assertFalse(report['input_tokenizer_verified'])
        self.assertFalse(report['immutable_model_revision_verified'])
        self.assertEqual('pending', report['human_semantic_review'])
        self.assertEqual(4, len(report['cases']))
        self.assertTrue(all(fixture.closed for fixture in self.fixtures))
        self.assertEqual(0o600, self.report.stat().st_mode & 0o777)
        for case in report['cases']:
            self.assertEqual('pre_cleanup', case['budget_checkpoint'])
            self.assertTrue(case['provider_input_budget_verified'])
            self.assertEqual([], case['model_trace'])
            self.assertEqual(2, len(case['model_calls']))

    async def test_pipeline_failure_and_lost_started_event_still_collect_committed_budget(self):
        for fail in ('finish', 'started'):
            self.report = self.root / (fail + '.json')
            with self.assertRaisesRegex(RuntimeError, '^EVALUATION_STRUCTURAL_FAILED$'):
                await self.evaluate(fail=fail)
            report = json.loads(self.report.read_text())
            self.assertFalse(report['provider_input_budget_verified'])
            for case in report['cases']:
                self.assertIsNotNone(case['budget'])
                self.assertEqual(2, len(case['model_calls']))
                self.assertIsNotNone(case['pipeline_error'])
            self.assertNotIn(PRIVATE, json.dumps(report))
        self.assertTrue(all(fixture.closed for fixture in self.fixtures))

    async def test_budget_read_failure_preserves_primary_error_and_still_closes_every_fixture(self):
        with self.assertRaises(RuntimeError):
            await self.evaluate(fail='finish', read_error=True)
        report = json.loads(self.report.read_text())
        for case in report['cases']:
            self.assertEqual('AGENT_MODEL_TIMEOUT', case['pipeline_error'])
            self.assertEqual('EVALUATION_BUDGET_UNAVAILABLE', case['budget_error'])
            self.assertEqual(2, case['budget']['model_count'])
            self.assertEqual([], case['model_calls'])
            self.assertFalse(case['budget_projection_valid'])
        self.assertTrue(all(fixture.closed for fixture in self.fixtures))
        self.assertNotIn(PRIVATE, json.dumps(report))

    async def test_cleanup_failure_stops_next_case_and_keeps_safe_evidence(self):
        with self.assertRaisesRegex(RuntimeError, '^EVALUATION_CLEANUP_FAILED$'):
            await self.evaluate(cleanup_error=True)
        report = json.loads(self.report.read_text())
        self.assertEqual(1, len(self.fixtures))
        self.assertEqual('cleanup_failed', report['evaluation_status'])
        self.assertEqual(30, report['cases'][0]['budget']['model_input_tokens_reserved'])
        self.assertNotIn(PRIVATE, json.dumps(report))

    async def test_exclusive_report_and_production_guard_run_before_fixture_factory(self):
        self.report.write_text(PRIVATE)
        with self.assertRaises(FileExistsError):
            await self.evaluate()
        self.assertEqual([], self.fixtures)
        self.assertEqual(PRIVATE, self.report.read_text())
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='production'), patch.object(evaluation, 'create_report') as create:
            with self.assertRaises(ValueError):
                await self.evaluate()
        create.assert_not_called()
        self.assertEqual([], self.fixtures)


if __name__ == '__main__':
    unittest.main()

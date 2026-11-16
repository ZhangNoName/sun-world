"""Report projection regression only: no network, database or SDK runtime."""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
import test_blog_qa_model_proxy as fixtures
from src.modules.ai import model_proxy

spec = importlib.util.spec_from_file_location('model_report_fixture', ROOT / 'apps/api/tests/integration/sdk_stack.py')
stack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stack)
MARKER = 'SYNTHETIC_PRIVATE_REPORT_MARKER'


class ModelReportProjectionTests(unittest.TestCase):
    def test_valid_shape_retains_diagnostics_but_not_private_reasoning(self):
        shape = stack.model_response_shape(fixtures.valid_response(tools=True), 'fixture-model')
        self.assertEqual('fixture-model', shape['model'])
        self.assertEqual({'prompt_tokens': 20, 'completion_tokens': 12, 'total_tokens': 32}, shape['usage'])
        self.assertEqual(1, shape['choice_count'])
        choice = shape['choices'][0]
        self.assertEqual((0, 'tool_calls'), (choice['index'], choice['finish_reason']))
        self.assertEqual('blog_search_public', choice['tool_calls'][0]['name'])
        self.assertEqual({'type': 'str', 'is_null': False, 'length': 392}, choice['metadata']['reasoning'])
        self.assertEqual({'type': 'NoneType', 'is_null': True, 'length': None}, choice['metadata']['audio'])
        self.assertFalse(fixtures.SYNTHETIC_REASONING in json.dumps(shape))

    def test_unvalidated_values_and_unknown_field_names_are_never_projected(self):
        faults = [
            (('model',), MARKER), (('model',), {'private': MARKER}),
            (('choices', 0, 'index'), {MARKER: MARKER}),
            (('choices', 0, 'finish_reason'), MARKER),
            (('choices', 0, 'finish_reason'), {MARKER: MARKER}),
            (('choices', 0, 'message', 'tool_calls', 0, 'function', 'name'), MARKER),
            (('choices', 0, 'message', 'tool_calls', 0, 'function', 'name'), {MARKER: MARKER}),
            (('choices', 0, 'message', 'reasoning'), MARKER),
            (('usage', 'prompt_tokens'), {MARKER: MARKER}),
        ]
        for path, value in faults:
            body = fixtures.valid_response(tools=True)
            fixtures.set_path(body, path, value)
            self.assertFalse(MARKER in json.dumps(stack.model_response_shape(body, 'fixture-model')))
        for path in ((), ('usage',), ('choices', 0), ('choices', 0, 'message'),
                     ('choices', 0, 'message', 'tool_calls', 0),
                     ('choices', 0, 'message', 'tool_calls', 0, 'function')):
            body = fixtures.valid_response(tools=True)
            target = body
            for key in path:
                target = target[key]
            target[MARKER] = {MARKER: MARKER}
            self.assertFalse(MARKER in json.dumps(stack.model_response_shape(body, 'fixture-model')))

    def test_projection_bounds_invalid_choice_and_tool_summaries(self):
        body = fixtures.valid_response(tools=True)
        body['choices'] *= 100
        body['choices'][0]['message']['tool_calls'] *= 100
        shape = stack.model_response_shape(body, 'fixture-model')
        self.assertEqual(100, shape['choice_count'])
        self.assertEqual(2, len(shape['choices']))
        self.assertEqual(100, shape['choices'][0]['tool_call_count'])
        self.assertEqual(5, len(shape['choices'][0]['tool_calls']))


class ModelReportPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def convert(self, value):
        class Proxy:
            async def __call__(self, _body):
                return model_proxy.response_to_messages(value, 'fixture-model')
        fixture = object.__new__(stack.Fixture)
        fixture.model_steps, fixture.model_requests, fixture.model_trace = 0, [], []
        fixture.model_id, fixture.real_proxy = 'fixture-model', Proxy()
        return fixture, fixture.model(fixtures.valid_messages())

    async def test_rejected_response_never_leaves_raw_values_or_success_result_in_report(self):
        paths = (('model',), ('choices', 0, 'index'), ('choices', 0, 'finish_reason'),
                 ('choices', 0, 'message', 'tool_calls', 0, 'function', 'name'),
                 ('choices', 0, 'message', MARKER))
        for path in paths:
            body = fixtures.valid_response(tools=True)
            fixtures.set_path(body, path, {MARKER: MARKER} if path[-1] == 'index' else MARKER)
            fixture, call = await self.convert(body)
            with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_RESPONSE_INVALID$'):
                await call
            self.assertIsNone(fixture.model_trace[0]['result'])
            self.assertFalse(MARKER in json.dumps(fixture.model_trace))

    async def test_only_successful_strict_conversion_is_recorded_as_result(self):
        body = fixtures.valid_response(tools=True)
        fixture, call = await self.convert(body)
        converted = await call
        self.assertEqual(converted, fixture.model_trace[0]['result'])
        self.assertEqual({'input_tokens': 20, 'output_tokens': 12}, converted['usage'])
        self.assertIsNone(fixture.model_trace[0]['error'])
        self.assertFalse(fixtures.SYNTHETIC_REASONING in json.dumps(fixture.model_trace))


if __name__ == '__main__':
    unittest.main()

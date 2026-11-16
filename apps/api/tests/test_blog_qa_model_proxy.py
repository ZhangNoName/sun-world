import copy
import json
import sys
import unittest
from dataclasses import FrozenInstanceError
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.modules.ai.model_proxy import (
    INPUT_INVALID, RESPONSE_INVALID, STRUCTURED_MODEL_LIMITS,
    StructuredModelProxy, messages_to_openai, response_to_messages,
)
from src.modules.ai.providers import ProviderConfig


SYNTHETIC_REASONING = ('synthetic private reasoning ' * 16)[:392]


def valid_messages():
    return {
        'model': 'fixture-model', 'max_tokens': 1024, 'stream': False,
        'thinking': {'type': 'disabled'},
        'system': [{'type': 'text', 'text': 'Only two read tools.'}],
        'messages': [
            {'role': 'user', 'content': 'Find public articles.'},
            {'role': 'assistant', 'content': [
                {'type': 'text', 'text': 'Reading.'},
                {'type': 'tool_use', 'id': 'c1', 'name': 'blog_read_public', 'input': {'article_id': 1}},
            ]},
            {'role': 'user', 'content': [
                {'type': 'tool_result', 'tool_use_id': 'c1',
                 'content': [{'type': 'text', 'text': '公开文章'}]},
                {'type': 'text', 'text': 'Explain the result.'},
            ]},
        ],
        'tools': [
            {'name': 'blog_search_public', 'description': 'Search public articles.',
             'input_schema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
            {'name': 'blog_read_public', 'description': 'Read public article.',
             'input_schema': {'type': 'object', 'properties': {'article_id': {'type': 'integer'}}, 'required': ['article_id']}},
        ],
    }


def valid_response(*, tools=False):
    # Observed standard-compatible shapes, with synthetic text only. The live
    # Qwen sample had null neutral fields and a nonempty 392-character string;
    # no live reasoning text is copied into fixtures or public output.
    message = {'annotations': None, 'audio': None, 'content': 'Public answer.',
        'function_call': None, 'reasoning': SYNTHETIC_REASONING, 'refusal': None,
        'role': 'assistant', 'tool_calls': None}
    if tools:
        message['tool_calls'] = [{'id': 'c2', 'type': 'function',
            'function': {'name': 'blog_search_public', 'arguments': '{"query":"权限"}'}}]
    return {'id': 'chatcmpl_fixture', 'object': 'chat.completion', 'model': 'fixture-model',
        'choices': [{'index': 0, 'message': message, 'finish_reason': 'tool_calls' if tools else 'stop'}],
        'usage': {'prompt_tokens': 20, 'completion_tokens': 12, 'total_tokens': 32}}


def set_path(value, path, replacement):
    target = value
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = replacement


class StructuredModelAdapterTests(unittest.TestCase):
    def assert_invalid(self, code, operation):
        with self.assertRaises(ValueError) as caught:
            operation()
        self.assertEqual(code, str(caught.exception))

    def test_messages_preserve_tool_identity_arguments_and_tool_before_user_text(self):
        converted = messages_to_openai(valid_messages())
        self.assertEqual(converted[2]['tool_calls'][0]['id'], 'c1')
        self.assertEqual(json.loads(converted[2]['tool_calls'][0]['function']['arguments']), {'article_id': 1})
        self.assertEqual(converted[3], {'role': 'tool', 'tool_call_id': 'c1', 'content': '公开文章'})
        self.assertEqual(converted[4], {'role': 'user', 'content': 'Explain the result.'})
        body = valid_messages()
        body['messages'][2]['content'][0]['is_error'] = True
        error = messages_to_openai(body)[3]['content']
        self.assertEqual(json.loads(error), {'is_error': True, 'content': '公开文章'})

    def test_request_single_field_faults_use_an_otherwise_complete_fixture(self):
        faults = [
            (('messages', 0, 'role'), 'system'),
            (('messages', 0, 'role'), True),
            (('messages', 0, 'content'), [{'type': 'image', 'source': 'secret'}]),
            (('messages', 0, 'content'), [{'type': 'text', 'text': 1}]),
            (('messages', 0, 'content'), ''),
            (('system',), [{'type': 'image', 'text': 'secret'}]),
            (('thinking',), {'type': 'enabled'}),
            (('thinking',), {'type': 'disabled', 'budget_tokens': 0}),
            (('thinking',), {}),
            (('thinking',), None),
            (('thinking',), 'disabled'),
            (('thinking',), []),
            (('thinking',), {'type': True}),
            (('output_config',), {'effort': 'off'}),
            (('messages', 1, 'content', 1, 'name'), 'write_file'),
            (('messages', 1, 'content', 1, 'name'), []),
            (('messages', 1, 'content', 1, 'input'), []),
            (('messages', 1, 'content', 1, 'id'), ''),
            (('messages', 2, 'content', 0, 'tool_use_id'), 'foreign'),
            (('messages', 2, 'content', 0, 'content'), [{'type': 'image', 'text': 'not plain'}]),
            (('messages', 2, 'content', 0, 'is_error'), 'true'),
            (('messages', 0, 'content'), '\ud800'),
            (('messages', 1, 'content', 1, 'input'), {'article_id': float('nan')}),
            (('messages', 1, 'content', 1, 'input'), {1: 'non-string-key'}),
        ]
        for path, replacement in faults:
            with self.subTest(path=path):
                body = valid_messages()
                set_path(body, path, replacement)
                self.assert_invalid(INPUT_INVALID, lambda: messages_to_openai(body))

    def test_call_result_association_duplicate_ids_and_missing_results_fail(self):
        for change in ('duplicate_call', 'duplicate_result', 'unresolved', 'wrong_role', 'text_before_result'):
            with self.subTest(change=change):
                body = valid_messages()
                if change == 'duplicate_call':
                    body['messages'][1]['content'].append(copy.deepcopy(body['messages'][1]['content'][1]))
                elif change == 'duplicate_result':
                    body['messages'][2]['content'].insert(1, copy.deepcopy(body['messages'][2]['content'][0]))
                elif change == 'unresolved':
                    body['messages'].pop()
                elif change == 'wrong_role':
                    body['messages'][2]['role'] = 'assistant'
                else:
                    body['messages'][2]['content'].reverse()
                self.assert_invalid(INPUT_INVALID, lambda: messages_to_openai(body))

    def test_request_json_depth_and_utf8_bytes_are_bounded(self):
        body = valid_messages()
        body['messages'][0]['content'] = '界' * 44000
        self.assert_invalid(INPUT_INVALID, lambda: messages_to_openai(body))
        nested = {}
        for _ in range(34):
            nested = {'nested': nested}
        body = valid_messages()
        body['messages'][1]['content'][1]['input'] = nested
        self.assert_invalid(INPUT_INVALID, lambda: messages_to_openai(body))

    def test_output_preserves_text_call_arguments_stop_reason_and_known_usage(self):
        result = response_to_messages(valid_response(tools=True), 'fixture-model')
        self.assertEqual(result['stop_reason'], 'tool_use')
        self.assertEqual(result['content'][1], {'type': 'tool_use', 'id': 'c2',
            'name': 'blog_search_public', 'input': {'query': '权限'}})
        self.assertEqual(result['usage'], {'input_tokens': 20, 'output_tokens': 12})
        for reason, stop in (('stop', 'end_turn'), ('length', 'max_tokens')):
            body = valid_response()
            body['choices'][0]['finish_reason'] = reason
            self.assertEqual(response_to_messages(body, 'fixture-model')['stop_reason'], stop)
        body = valid_response(tools=True)
        body['choices'][0]['finish_reason'] = 'length'
        self.assertEqual(response_to_messages(body, 'fixture-model')['stop_reason'], 'max_tokens')

    def test_provider_reasoning_is_not_returned_as_public_text(self):
        variants = [
            {},  # Exact observed metadata shape is accepted.
            {'annotations': []},
            {'reasoning': None, 'reasoning_content': SYNTHETIC_REASONING},
            {'reasoning_content': SYNTHETIC_REASONING},  # Identical nonempty aliases.
            {'reasoning': '', 'reasoning_content': SYNTHETIC_REASONING},
            {'reasoning': None, 'reasoning_content': ''},
            {'reasoning': json.dumps({'tool_calls': [{'id': 'invented', 'name': 'write_file'}]})},
        ]
        for variant in variants:
            body = valid_response()
            body['choices'][0]['message'].update(variant)
            converted = response_to_messages(body, 'fixture-model')
            self.assertEqual([{'type': 'text', 'text': 'Public answer.'}], converted['content'])
            self.assertEqual({'input_tokens': 20, 'output_tokens': 12}, converted['usage'])
            self.assertFalse(any(key in converted for key in ('reasoning', 'reasoning_content', 'annotations', 'audio', 'function_call')))
            self.assertFalse(SYNTHETIC_REASONING in json.dumps(converted))

    def test_non_neutral_or_ambiguous_metadata_is_rejected_one_field_at_a_time(self):
        faults = [
            ('annotations', [{}]), ('annotations', {}), ('annotations', False), ('annotations', ''),
            ('audio', {}), ('audio', []), ('audio', 'base64-audio'), ('audio', False),
            ('function_call', {}), ('function_call', {'name': 'blog_read_public', 'arguments': '{"article_id":1}'}),
            ('function_call', []), ('function_call', ''),
            ('reasoning', []), ('reasoning', {}), ('reasoning', True), ('reasoning', 1),
            ('reasoning_content', []), ('reasoning_content', {}), ('reasoning_content', False),
            ('reasoning_content', 'A different nonempty synthetic reasoning value.'),
        ]
        for field, value in faults:
            with self.subTest(field=field):
                body = valid_response(tools=True)
                body['choices'][0]['message'][field] = value
                self.assert_invalid(RESPONSE_INVALID, lambda: response_to_messages(body, 'fixture-model'))

    def test_response_single_field_faults_use_an_otherwise_complete_fixture(self):
        faults = [
            (('choices',), []),
            (('choices', 0, 'index'), True),
            (('choices', 0, 'index'), 1),
            (('choices', 0, 'finish_reason'), 'content_filter'),
            (('choices', 0, 'message', 'role'), 'user'),
            (('choices', 0, 'message', 'content'), ['text']),
            (('choices', 0, 'message', 'content'), '\ud800'),
            (('choices', 0, 'message', 'refusal'), 'refused'),
            (('choices', 0, 'message', 'tool_calls'), 'not-list'),
            (('id',), None),
            (('id',), ''),
            (('model',), 'another-model'),
            (('model',), None),
            (('usage',), None),
            (('usage', 'prompt_tokens'), None),
            (('usage', 'prompt_tokens'), True),
            (('usage', 'prompt_tokens'), '20'),
            (('usage', 'prompt_tokens'), 20.0),
            (('usage', 'prompt_tokens'), -1),
            (('usage', 'prompt_tokens'), 2**31),
            (('usage', 'completion_tokens'), 1025),
            (('usage', 'total_tokens'), True),
            (('usage', 'total_tokens'), 31),
        ]
        for path, replacement in faults:
            with self.subTest(path=path):
                body = valid_response()
                set_path(body, path, replacement)
                self.assert_invalid(RESPONSE_INVALID, lambda: response_to_messages(body, 'fixture-model'))

    def test_unknown_usage_is_rejected_instead_of_fabricated_zero(self):
        for missing in ('usage', 'prompt_tokens', 'completion_tokens'):
            body = valid_response()
            if missing == 'usage':
                body.pop(missing)
            else:
                body['usage'].pop(missing)
            self.assert_invalid(RESPONSE_INVALID, lambda: response_to_messages(body, 'fixture-model'))
        body = valid_response()
        body['usage'] = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
        self.assertEqual(response_to_messages(body, 'fixture-model')['usage'], {'input_tokens': 0, 'output_tokens': 0})

    def test_tool_output_faults_preserve_complete_valid_response_context(self):
        faults = [
            (('id',), 'invalid id'),
            (('type',), 'custom'),
            (('function', 'name'), 'write_file'),
            (('function', 'name'), []),
            (('function', 'arguments'), {}),
            (('function', 'arguments'), '{'),
            (('function', 'arguments'), '[]'),
            (('function', 'arguments'), '{"query":"a","query":"b"}'),
            (('function', 'arguments'), '{"value":NaN}'),
            (('function', 'arguments'), '{"value":1e999}'),
            (('function', 'arguments'), '{"query":"\\ud800"}'),
        ]
        for path, replacement in faults:
            body = valid_response(tools=True)
            set_path(body['choices'][0]['message']['tool_calls'][0], path, replacement)
            self.assert_invalid(RESPONSE_INVALID, lambda: response_to_messages(body, 'fixture-model'))
        for change in ('duplicate', 'mismatched_stop', 'extra_choice'):
            body = valid_response(tools=True)
            if change == 'duplicate':
                body['choices'][0]['message']['tool_calls'] *= 2
            elif change == 'mismatched_stop':
                body['choices'][0]['finish_reason'] = 'stop'
            else:
                body['choices'] *= 2
            self.assert_invalid(RESPONSE_INVALID, lambda: response_to_messages(body, 'fixture-model'))

    def test_limits_are_frozen_and_not_derived_from_worker_body(self):
        config = ProviderConfig('fixture', 'fixture-model', 'https://models.example.com/v1', auth_mode='none')
        proxy = StructuredModelProxy(config)
        self.assertIs(proxy.limits, STRUCTURED_MODEL_LIMITS)
        self.assertEqual((1024, 131072, 65536, 30), (proxy.limits.max_output_tokens,
            proxy.limits.max_request_bytes, proxy.limits.max_response_bytes, proxy.limits.total_timeout_seconds))
        with self.assertRaises((FrozenInstanceError, AttributeError)):
            proxy.limits.max_output_tokens = 100000
        with self.assertRaises(AttributeError):
            proxy.limits = object()

    def test_configuration_parameter_faults_fail_before_any_provider(self):
        valid = dict(provider='fixture', model='fixture-model', base_url='https://models.example.com/v1',
                     auth_mode='bearer', api_key='synthetic-only-key')
        for change in ({'model': ''}, {'model': ' '}, {'model': 'model\n'}, {'model': 'm' * 161},
                       {'auth_mode': 'unknown'}, {'api_key': None}, {'api_key': 'key\n'},
                       {'api_key': 'key value'}, {'api_key': '非ASCII'}, {'api_key': '\ud800'}):
            with self.subTest(field=next(iter(change))):
                self.assert_invalid(INPUT_INVALID,
                    lambda: StructuredModelProxy(ProviderConfig(**{**valid, **change}),
                        provider_factory=lambda *_args, **_kwargs: self.fail('Provider must not be constructed')))


if __name__ == '__main__':
    unittest.main()

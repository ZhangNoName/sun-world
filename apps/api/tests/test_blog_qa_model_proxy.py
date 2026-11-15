import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'tools/dsh-blog-local'))
from model_proxy import messages_to_openai, response_to_messages


class LocalModelProxyTests(unittest.TestCase):
    def test_messages_preserve_tool_identity_and_arguments(self):
        messages = messages_to_openai({'system': [{'type': 'text', 'text': 'rules'}], 'messages': [
            {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'c1', 'name': 'blog_read_public', 'input': {'article_id': 1}}]},
            {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': 'c1', 'content': [{'type': 'text', 'text': 'result'}]}]},
        ]})
        self.assertEqual(messages[1]['tool_calls'][0]['id'], 'c1')
        self.assertEqual(messages[2], {'role': 'tool', 'tool_call_id': 'c1', 'content': 'result'})

    def test_unsupported_or_truncated_model_stop_is_never_success(self):
        message = {'content': 'text'}
        with self.assertRaises(ValueError):
            response_to_messages({'choices': [{'message': message, 'finish_reason': 'unknown'}]})
        converted = response_to_messages({'choices': [{'message': message, 'finish_reason': 'length'}]})
        self.assertEqual(converted['stop_reason'], 'max_tokens')

    def test_malformed_json_arguments_are_not_repaired(self):
        with self.assertRaises(ValueError):
            response_to_messages({'choices': [{'message': {'tool_calls': [{'id': 'c1', 'function': {'name': 'blog_read_public', 'arguments': '{'}}]}, 'finish_reason': 'tool_calls'}]})

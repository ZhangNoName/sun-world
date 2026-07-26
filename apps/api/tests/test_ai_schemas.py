import json
import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class AiSchemaTests(unittest.TestCase):
    def test_sse_encoder_emits_one_versioned_data_frame(self):
        from src.modules.ai.schemas import AiStreamEvent, encode_sse_event

        event = AiStreamEvent(
            event_id="evt-1",
            type="content.delta",
            conversation_id="conv-1",
            message_id="msg-1",
            sequence=2,
            data={"delta": "你好"},
        )

        frame = encode_sse_event(event)

        self.assertTrue(frame.startswith("data: "))
        self.assertTrue(frame.endswith("\n\n"))
        self.assertEqual(frame.count("data:"), 1)
        payload = json.loads(frame.removeprefix("data: ").strip())
        self.assertEqual(payload["version"], "1")
        self.assertEqual(payload["data"], {"delta": "你好"})

    def test_link_blocks_reject_script_urls(self):
        from pydantic import ValidationError

        from src.modules.ai.schemas import AiLinkBlock

        with self.assertRaises(ValidationError):
            AiLinkBlock(label="unsafe", url="javascript:alert(1)")


if __name__ == "__main__":
    unittest.main()

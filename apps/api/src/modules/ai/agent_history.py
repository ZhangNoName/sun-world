"""AI-owned transcript writes on the caller's existing run transaction."""

import json
import re
from datetime import datetime
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError

from .errors import AiDomainError
from .schemas import AiContentBlock, AiLinkBlock, AiTextBlock


AGENT_CONVERSATION_PREFIX = "agent_conv_"
_AGENT_CONVERSATION_ID = re.compile(r"agent_conv_[0-9a-f]{32}\Z")
_BLOCKS = TypeAdapter(list[AiContentBlock])


def require_ordinary_conversation(conversation_id: str) -> None:
    # MySQL conversation IDs use a case-insensitive historical collation.
    # A differently cased request must not reach an Agent transcript either.
    if str(conversation_id).lower().startswith(AGENT_CONVERSATION_PREFIX):
        raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Conversation not found.", status_code=404)


def _validate_context(user_id, conversation_id, now):
    if (type(user_id) is not int or user_id <= 0
            or not isinstance(conversation_id, str)
            or not _AGENT_CONVERSATION_ID.fullmatch(conversation_id)):
        raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Conversation not found.", status_code=404)
    if not isinstance(now, datetime) or now.tzinfo is not None:
        raise AiDomainError("AI_CONVERSATION_MISMATCH", "UTC naive timestamp required.", status_code=409)


def _serialize(blocks):
    return json.dumps([block.model_dump(mode="json") for block in blocks],
                      ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class AgentHistoryTransactions:
    """Only the run service calls these after admission/source validation.

    This module owns history structure, not Agent permission, current session,
    run state or source authority. In particular a syntactically valid link is
    not evidence of a delivered source; the run service must verify that first.
    No connection, transaction commit or rollback is created here.
    """

    def erase(self, uow, *, user_id, conversation_id, now):
        """Remove only the canonical transcript, including legacy hidden rows.

        Historical MySQL identifiers are accent/case insensitive. The exact
        bytes of both conversation and feedback/message identity matter here.
        The caller owns the run lock and commits this together with its marker.
        """
        _validate_context(user_id, conversation_id, now)
        owned = uow.fetch_one('SELECT id FROM ai_conversations WHERE id=%s AND user_id=%s FOR UPDATE',
                              (conversation_id, user_id))
        if not owned or owned['id'] != conversation_id:
            raise AiDomainError('AI_RESOURCE_NOT_FOUND', 'Conversation not found.', status_code=404)
        # Indexed equality narrows candidates; the second predicate prevents
        # historical case/accent folding from widening those candidates.
        uow.execute('DELETE FROM ai_message_feedback WHERE message_id IN '
                    '(SELECT id FROM ai_messages WHERE conversation_id=%s '
                    'AND CAST(conversation_id AS BINARY)=CAST(%s AS BINARY)) '
                    'AND CAST(message_id AS BINARY) IN '
                    '(SELECT CAST(id AS BINARY) FROM ai_messages '
                    'WHERE conversation_id=%s AND CAST(conversation_id AS BINARY)=CAST(%s AS BINARY))',
                    (conversation_id, conversation_id, conversation_id, conversation_id))
        uow.execute('DELETE FROM ai_messages WHERE conversation_id=%s '
                    'AND CAST(conversation_id AS BINARY)=CAST(%s AS BINARY)',
                    (conversation_id, conversation_id))
        removed = uow.execute('DELETE FROM ai_conversations WHERE user_id=%s '
                              'AND id=%s AND CAST(id AS BINARY)=CAST(%s AS BINARY)',
                              (user_id, conversation_id, conversation_id))
        if removed != 1:
            raise AiDomainError('AI_RESOURCE_NOT_FOUND', 'Conversation not found.', status_code=404)

    def read(self, uow, *, user_id, conversation_id, now):
        """Bounded Agent-only recovery through the owning module's public API."""
        _validate_context(user_id, conversation_id, now)
        owned = uow.fetch_one('SELECT id FROM ai_conversations WHERE id=%s AND user_id=%s AND is_deleted=0',
                              (conversation_id, user_id))
        if not owned or owned['id'] != conversation_id:
            raise AiDomainError('AI_RESOURCE_NOT_FOUND', 'Conversation not found.', status_code=404)
        messages = uow.fetch_all('SELECT role,sequence,blocks,status FROM ai_messages '
                                 'WHERE conversation_id=%s ORDER BY sequence ASC LIMIT 3', (conversation_id,))
        if (not 1 <= len(messages) <= 2 or messages[0]['role'] != 'user' or messages[0]['sequence'] != 1
                or (len(messages) == 2 and (messages[1]['role'] != 'assistant' or messages[1]['sequence'] != 2))):
            raise AiDomainError('AI_CONVERSATION_MISMATCH', 'Invalid Agent transcript.', status_code=409)
        result = []
        try:
            for message in messages:
                raw = message['blocks']
                if isinstance(raw, (str, bytes)):
                    if len(raw.encode() if isinstance(raw, str) else raw) > 65536:
                        raise ValueError
                    raw = json.loads(raw)
                blocks = _BLOCKS.validate_python(raw)
                if (message['status'] != 'completed' or not blocks
                        or any(not isinstance(block, (AiTextBlock, AiLinkBlock)) for block in blocks)
                        or not isinstance(blocks[0], AiTextBlock)
                        or any(isinstance(block, AiTextBlock) and block.format != 'plain' for block in blocks)):
                    raise ValueError
                if message['role'] == 'user' and (len(blocks) != 1 or not blocks[0].text.strip()
                                                  or len(blocks[0].text) > 2000):
                    raise ValueError
                if message['role'] == 'assistant' and (len(blocks) > 5
                        or len(blocks[0].text.encode()) > 32768
                        or any(not isinstance(block, AiLinkBlock) for block in blocks[1:])):
                    raise ValueError
                result.append({'role': message['role'], 'blocks': blocks})
        except (TypeError, ValueError, UnicodeError):
            raise AiDomainError('AI_CONVERSATION_MISMATCH', 'Invalid Agent transcript.', status_code=409) from None
        return result

    def create(self, uow, *, user_id, conversation_id, question, now):
        _validate_context(user_id, conversation_id, now)
        if not isinstance(question, str) or not question.strip() or len(question) > 2000:
            raise AiDomainError("AI_CONVERSATION_MISMATCH", "Invalid question.", status_code=409)
        question = question.strip()
        uow.execute(
            "INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            (conversation_id, user_id, question[:100], now, now),
        )
        uow.execute(
            "INSERT INTO ai_messages "
            "(id, conversation_id, role, blocks, sequence, status, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            ("agent_msg_" + uuid4().hex, conversation_id, "user",
             _serialize([AiTextBlock(text=question, format="plain")]), 1, "completed", now, now),
        )
        return conversation_id

    def complete(self, uow, *, user_id, conversation_id, blocks, now):
        _validate_context(user_id, conversation_id, now)
        try:
            blocks = _BLOCKS.validate_python(blocks)
        except ValidationError:
            raise AiDomainError("AI_CONVERSATION_MISMATCH", "Invalid answer blocks.", status_code=409) from None
        if (not blocks or not isinstance(blocks[0], AiTextBlock)
                or any(not isinstance(block, (AiTextBlock, AiLinkBlock)) for block in blocks)
                or any(isinstance(block, AiTextBlock) and block.format != "plain" for block in blocks)):
            raise AiDomainError("AI_CONVERSATION_MISMATCH", "Plain answer and source links required.", status_code=409)
        owned = uow.fetch_one(
            "SELECT id FROM ai_conversations "
            "WHERE id = %s AND user_id = %s AND is_deleted = 0 FOR UPDATE",
            (conversation_id, user_id),
        )
        if not owned:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Conversation not found.", status_code=404)
        messages = uow.fetch_all(
            "SELECT role, sequence FROM ai_messages WHERE conversation_id = %s ORDER BY sequence ASC",
            (conversation_id,),
        )
        if len(messages) != 1 or messages[0]["role"] != "user" or messages[0]["sequence"] != 1:
            raise AiDomainError("AI_CONVERSATION_MISMATCH", "Agent history is not awaiting an answer.", status_code=409)
        message_id = "agent_msg_" + uuid4().hex
        uow.execute(
            "INSERT INTO ai_messages "
            "(id, conversation_id, role, blocks, sequence, status, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (message_id, conversation_id, "assistant", _serialize(blocks), 2, "completed", now, now),
        )
        uow.execute("UPDATE ai_conversations SET updated_at = %s WHERE id = %s", (now, conversation_id))
        return message_id


def agent_answer_blocks(answer, links):
    """AI-owned plain-answer representation; the gateway owns link authority."""
    if (not isinstance(answer, str) or not answer.strip() or len(answer.encode()) > 32768
            or not isinstance(links, list) or len(links) > 4):
        raise AiDomainError("AI_CONVERSATION_MISMATCH", "Invalid answer.", status_code=409)
    return [AiTextBlock(text=answer, format="plain"), *[AiLinkBlock(**link) for link in links]]

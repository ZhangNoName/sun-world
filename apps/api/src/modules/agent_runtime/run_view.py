"""Owned run projection; AI owns transcript reads, gateway owns citations."""

import hashlib

from .ledger import LedgerError, digest


class RunView:
    def __init__(self, gateway):
        self.gateway = gateway
        self.ledger = gateway.ledger

    def project(self, uow, row, principal):
        messages = self.ledger.history.read(uow, user_id=principal.user_id,
            conversation_id=row['conversation_id'], now=self.ledger.now())
        question = messages[0]['blocks'][0].text
        if digest({'scenario': 'blog-qa', 'question': question.strip()}) != row['request_hash']:
            raise LedgerError('AGENT_STATE_CONFLICT')
        state = dict(id=row['id'], status=row['status'], question=question,
                     answer=None, sources=[], error_code=row['error_code'])
        if row['status'] != 'completed':
            if len(messages) != 1:
                raise LedgerError('AGENT_STATE_CONFLICT')
            return state
        if len(messages) != 2:
            raise LedgerError('AGENT_STATE_CONFLICT')
        blocks = messages[1]['blocks']
        if digest([block.model_dump(mode='json') for block in blocks]) != row['result_hash']:
            raise LedgerError('AGENT_RESULT_CONFLICT')
        state['answer'] = blocks[0].text
        sources = uow.fetch_all('SELECT * FROM agent_sources WHERE run_id=%s AND generation=%s '
                                'AND delivered=1 LIMIT 5', (row['id'], row['generation']))
        if len(sources) > 4:
            raise LedgerError('AGENT_STATE_CONFLICT')
        verified = {}
        for source in sources:
            try:
                current = self.gateway._checked_result('blog.read_public',
                    self.gateway.source_reader(uow, principal, source['article_id']))
                if (current['content_hash'] != source['content_hash'] or current['title'] != source['title']
                        or hashlib.sha256(current['content'].encode()).hexdigest() != source['excerpt_hash']):
                    continue
                url = f"{self.gateway.origin}/blog/{source['article_id']}"
                verified[url] = dict(article_id=source['article_id'],
                    title=current['title'][:500] or f"文章 {source['article_id']}", url=url)
            except Exception:
                # Previously delivered plain text cannot be recalled; a link
                # which is no longer verifiable must disappear on recovery.
                continue
        seen = set()
        for block in blocks[1:]:
            url = getattr(block, 'url', None)
            current = verified.get(url)
            if current and current['title'] == block.label and url not in seen:
                state['sources'].append(current)
                seen.add(url)
        return state

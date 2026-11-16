"""Real owned MySQL/Redis/Auth/ASGI; capacity is not a global read switch."""

import asyncio
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

import test_agent_stack as fixture


class CapacityStackTests(fixture.AgentStackTests):
    def set_used(self, used=8192):
        self.pool.execute('INSERT INTO agent_ledger_capacity '
            '(id,format_version,capacity,used_count,initialized) VALUES(1,1,8192,%s,1) '
            'ON DUPLICATE KEY UPDATE used_count=%s,initialized=1', (used, used))

    def used(self):
        return self.pool.fetch_one('SELECT used_count FROM agent_ledger_capacity WHERE id=1')['used_count']

    async def completed(self):
        stream, run_id, key = await self.stream()
        await stream.finish()
        self.assertEqual(self.row(run_id)['status'], 'completed')
        return run_id, key

    async def test_capacity_full_no_new_charge_but_existing_history_and_delete_work(self):
        run_id, key = await self.completed()
        self.set_used()
        rate = self.rate()
        capabilities = await self.request('GET', '/capabilities')
        self.assertFalse(capabilities.json()['data']['enabled'])
        self.assertEqual(capabilities.json()['data']['reason'], 'AGENT_LEDGER_FULL')
        response = await self.request('POST', '/runs/stream', json={'question': 'new', 'idempotency_key': str(uuid4())})
        self.assertEqual((response.status_code, response.json()['code']), (503, 'AGENT_LEDGER_FULL'))
        self.assertNotIn('retry-after', response.headers)
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 200)
        duplicate = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(duplicate.json()['code'], 'AGENT_REQUEST_EXISTS')
        self.assertEqual((await self.request('POST', '/runs/' + run_id + '/cancel')).status_code, 200)
        self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)
        deleted = await self.request('POST', '/runs/stream', json={'question': 'changed', 'idempotency_key': key})
        self.assertEqual(deleted.json()['code'], 'AGENT_HISTORY_DELETED')
        self.assertEqual((self.used(), self.rate(), len(self.worker.payloads), self.model_calls), (8192, rate, 1, 1))

    async def test_capacity_preflight_race_releases_only_concurrency_not_minute(self):
        self.set_used(8191)
        key = str(uuid4())
        entered, release = threading.Event(), threading.Event()
        reserve = self.admission.reserve
        def paused(**values):
            if values['user_id'] == 1:
                entered.set()
                if not release.wait(5):
                    raise RuntimeError('Synthetic pre-reservation fence timed out')
            return reserve(**values)
        # Pause only scheduling: both real prechecks, Redis reservations and
        # locked accepts run unchanged. User two actually fills the last slot.
        with patch.object(self.admission, 'reserve', paused):
            first = asyncio.create_task(self.request('POST', '/runs/stream',
                json={'question': 'race', 'idempotency_key': key}))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                competing, _run_id, _ = await self.stream(token=self.other)
                await competing.finish()
                self.assertEqual(self.used(), 8192)
                self.assertEqual(self.rate(), '1')
            finally:
                release.set()
                async with asyncio.timeout(5):
                    results = await asyncio.gather(first, return_exceptions=True)
        response = results[0]
        self.assertEqual((response.status_code, response.json()['code']), (503, 'AGENT_LEDGER_FULL'))
        keys = self.admission._keys(1, key)
        self.assertEqual(self.redis.exists(keys[1]), 1)
        self.assertEqual(self.redis.exists(keys[4], keys[5]), 0)
        self.assertEqual(self.rate(), '2')
        self.assertEqual(self.redis.get(keys[2]), '1')
        self.assertEqual(self.used(), 8192)
        self.assertEqual(self.pool.fetch_one('SELECT COUNT(*) n FROM agent_runs')['n'], 1)
        self.assertEqual(len(self.worker.payloads), 1)

    async def test_capacity_unknown_commit_keeps_slot_and_counter_across_application_restart(self):
        key, accept = str(uuid4()), self.ledger.accept
        def lost(*args, **kwargs):
            accept(*args, **kwargs)  # Real MySQL transaction, including counter.
            raise OSError('Synthetic private post-COMMIT ACK loss')
        with patch.object(self.ledger, 'accept', lost):
            response = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.text)
        self.assertEqual(self.used(), 1)
        keys = self.admission._keys(1, key)
        self.assertEqual(self.redis.exists(keys[1], keys[4], keys[5]), 3)
        self.assertFalse(self.worker.payloads)
        await self.application.close()
        await self.client.aclose()
        self.application = self.make_application()
        self.make_host()
        duplicate = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(duplicate.json()['code'], 'AGENT_REQUEST_EXISTS')
        self.assertEqual((self.used(), self.rate()), (1, '1'))
        row = self.pool.fetch_one('SELECT id FROM agent_runs')
        self.assertEqual((await self.request('GET', '/runs/' + row['id'])).status_code, 200)

    async def test_capacity_corrupt_metadata_refuses_new_work_without_hiding_existing(self):
        run_id, _key = await self.completed()
        self.pool.execute('UPDATE agent_ledger_capacity SET format_version=2 WHERE id=1')
        rate = self.rate()
        response = await self.request('POST', '/runs/stream', json={'question': 'new', 'idempotency_key': str(uuid4())})
        self.assertEqual((response.status_code, response.json()['code']), (503, 'AGENT_LEDGER_CAPACITY_INVALID'))
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 200)
        self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)
        self.assertEqual((self.used(), self.rate()), (1, rate))

    async def test_capacity_full_does_not_revoke_already_running_execution(self):
        self.worker.mode = 'hold'
        stream, run_id, _key = await self.stream()
        await self.wait_started(run_id)
        self.set_used()
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 200)
        payload = self.worker.payloads[run_id]
        result = self.worker.call(payload, 'result')
        gateway = self.application.gateway
        await asyncio.to_thread(gateway.bind_root_turn, result, 'native-root-turn', root_request_id='native-root-request')
        await gateway.model(self.worker.call(payload, 'model'), {'messages': []})
        await asyncio.to_thread(gateway.finish, result, root_session_id=payload['root_session_id'],
            root_turn_id='native-root-turn', root_request_id='native-root-request', answer='合成完成', source_ids=[])
        self.worker.states[run_id] = 'completed'
        self.worker.tasks[run_id].cancel()
        await asyncio.gather(self.worker.tasks[run_id], return_exceptions=True)
        await stream.finish()
        response = await self.request('GET', '/runs/' + run_id)
        self.assertEqual((response.status_code, response.json()['data']['status']), (200, 'completed'))
        self.assertEqual(self.used(), 8192)
        self.assertEqual(self.model_calls, 1)


def load_tests(_loader, _tests, _pattern):
    return unittest.TestSuite(CapacityStackTests(name) for name in sorted(CapacityStackTests.__dict__)
                              if name.startswith('test_capacity_'))

"""Real MySQL contract/concurrency tests; only the owned launcher may enable them."""

import asyncio
import json
import os
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pymysql
from loguru import logger

logger.remove()
logger.add(sys.stderr, level="WARNING")

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests'))
from src.core.auth import Principal
from src.database.mysql.mysql_manage import MySQLManager
from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql
from src.module_composition import create_module_registry
from src.modules.agent_runtime.gateway import RunCall, RunGateway
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger, digest


class SocketManager(MySQLManager):
    def __init__(self, socket, database, pool_size=2):
        self.socket = socket
        super().__init__(host='localhost', port=0, db=database, user='root', password='',
                         pool_size=pool_size, connect_timeout=2, read_timeout=5, write_timeout=5)

    def _create_connection(self):
        connection = pymysql.connect(unix_socket=self.socket, user='root', password='', database=self.db,
            autocommit=False, cursorclass=pymysql.cursors.DictCursor, connect_timeout=2, read_timeout=5,
            write_timeout=5, init_command='SET SESSION innodb_lock_wait_timeout=3')
        return connection


@unittest.skipUnless(os.getenv('SUN_WORLD_AGENT_MYSQL_ROOT'), 'Use scripts/test-agent-mysql.py with a disposable server')
class AgentMySQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['SUN_WORLD_AGENT_MYSQL_ROOT']).resolve()
        marker = json.loads((directory / 'owner.json').read_text())
        if marker['nonce'] != os.getenv('SUN_WORLD_AGENT_MYSQL_NONCE') or not directory.name.startswith('sunworld-agent-mysql-'):
            raise RuntimeError('Missing owned MySQL launcher proof')
        cls.socket = str(directory / 'mysql.sock')
        with pymysql.connect(unix_socket=cls.socket, user='root', password='', connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT @@datadir,@@socket,@@skip_networking')
                data, socket, networking_disabled = cursor.fetchone()
                if Path(data).resolve() != directory / 'data' or Path(socket).resolve() != Path(cls.socket) or networking_disabled != 1:
                    raise RuntimeError('Integration tests refuse shared or TCP-enabled databases')

    def setUp(self):
        self.database = 'sunworld_agent_' + uuid4().hex[:16]
        self.admin = pymysql.connect(unix_socket=self.socket, user='root', password='', autocommit=True)
        self.addCleanup(self.admin.close)
        with self.admin.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
            cursor.execute(f'USE `{self.database}`')
            for name, definition in MYSQL_SCHEMA.items():
                cursor.execute(build_create_table_sql(name, definition))
        self.addCleanup(self.drop_database)
        self.pool = SocketManager(self.socket, self.database)
        self.addCleanup(self.pool.close)
        self.pool.execute("INSERT INTO users(id,name,email,password,status) VALUES(1,'synthetic','test@example.invalid','not-a-real-password',1)")
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(1,'synthetic-admin','admin')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,1)')
        self.time = datetime(2026, 11, 15, 1, tzinfo=timezone.utc)
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family', roles=('admin',))
        self.ledger = MySqlRunLedger(self.pool, clock=lambda: self.time)

    def drop_database(self):
        if not self.database.startswith('sunworld_agent_') or len(self.database) != 31:
            raise RuntimeError('Invalid disposable database name')
        with self.admin.cursor() as cursor:
            cursor.execute(f'DROP DATABASE `{self.database}`')

    def accept(self, key=None):
        return self.ledger.accept(self.owner, question='原始问题', idempotency_key=key or str(uuid4()),
                                  bundle_hash='a'*64, model_id='synthetic')

    def count(self, table):
        return self.pool.fetch_one(f'SELECT COUNT(*) AS n FROM {table}')['n']

    def test_actual_schema_and_socket_only_instance(self):
        self.assertEqual(self.pool.fetch_one('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()')['n'], len(MYSQL_SCHEMA))
        self.assertEqual(self.pool.fetch_one('SELECT @@skip_networking AS n')['n'], 1)
        row = self.accept().run
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['deadline'], row['deadline'])

    def test_concurrent_admission_and_claim_have_one_winner(self):
        key = str(uuid4())
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.accept(key), range(2)))
        self.assertEqual(sum(result.created for result in results), 1)
        self.assertEqual(self.count('ai_messages'), 1)
        run = results[0].run
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda _: self.ledger.claim(run['id'], execution_id=str(uuid4())), range(2)))
        self.assertEqual(sum(row is not None for row in claims), 1)

    def test_default_repeatable_read_and_opt_in_current_read_do_not_leak(self):
        # Use an independent non-pooled writer while the UOW retains one reader.
        def write_status(value):
            with self.admin.cursor() as cursor:
                cursor.execute('UPDATE users SET status=%s WHERE id=1', (value,))
        with self.pool.unit_of_work() as uow:
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
            write_status(0)
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
        write_status(1)
        with self.ledger.unit_of_work() as uow:
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
            write_status(0)
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 0)
        write_status(1)
        # A subsequent ordinary transaction still has the original default.
        with self.pool.unit_of_work() as uow:
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
            write_status(0)
            self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)

    def gateway(self, authorize=None, source_reader=None, allow=None, bind=None):
        def read(principal, arguments):
            content = '原始公开正文'
            return dict(article_id=1, title='原始标题', content=content, content_hash=digest({'article_id':1,'title':'原始标题','content':content}),
                        returned_bytes=len(content.encode()),content_bytes=len(content.encode()),truncated=False)
        async def model(_):
            return {'model':'synthetic','content':[],'stop_reason':'end_turn',
                    'usage': {'input_tokens': 10, 'output_tokens': 5}}
        gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public':lambda *_: {'items':[]},'blog.read_public':read},
            enabled=lambda:True, authorize=authorize or (lambda *_:self.owner), allow=allow or (lambda *_:True),
            worker_credential='S'*43,bundle_hash='a'*64,model_id='synthetic',model_proxy=model,
            site_origin='https://example.test',source_reader=source_reader or (lambda uow,p,a:read(p,{'article_id':a})))
        accepted = self.accept().run
        if bind is not None: bind(accepted)
        row, tokens = gateway.claim(accepted['id'],execution_id=str(uuid4()))
        tool = RunCall(row['id'],row['execution_id'],1,'S'*43,tokens.tool)
        result = RunCall(row['id'],row['execution_id'],1,'S'*43,tokens.result)
        gateway.bind_root_turn(result,'root')
        return gateway,row,tool,result

    def finish(self,gateway,row,result,sources):
        return gateway.finish(result,root_session_id=row['root_session_id'],root_turn_id='root',answer='完成回答',source_ids=sources)

    def test_native_model_precharge_concurrency_and_observations(self):
        from src.modules.agent_runtime.gateway import RunCredentials
        with patch('src.modules.agent_runtime.gateway.RunCredentials', return_value=RunCredentials('T'*43, 'M'*43, 'R'*43)):
            gateway, row, _, _ = self.gateway()
        call = RunCall(row['id'], row['execution_id'], 1, 'S'*43, 'M'*43)
        async def scenario():
            return await asyncio.gather(*(gateway.model(call, {'messages': []}) for _ in range(8)), return_exceptions=True)
        results = asyncio.run(scenario())
        self.assertEqual(sum(isinstance(item, dict) for item in results), 4)
        self.assertEqual(sum(isinstance(item, LedgerError) for item in results), 4)
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual((observed['model_count'], observed['model_output_tokens_reserved'],
            observed['model_response_bytes_reserved'], observed['model_output_tokens_observed']), (4, 4096, 262144, 20))
        calls = self.pool.fetch_all('SELECT state,input_tokens,output_tokens FROM agent_model_calls WHERE run_id=%s', (row['id'],))
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(item == {'state': 'observed', 'input_tokens': 10, 'output_tokens': 5} for item in calls))

    def counted_gateway(self, *, counting=None):
        from test_counted_model_budget import make_proxy
        from src.modules.ai.openai_responses import MODEL
        proxy, factory = make_proxy(tokens=16384, counting=counting)
        gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public': lambda *_: {'items': []}, 'blog.read_public': lambda *_: None},
            enabled=lambda: True, authorize=lambda *_: self.owner, allow=lambda *_: True,
            worker_credential='S'*43, bundle_hash='a'*64, model_id=MODEL, model_proxy=proxy,
            site_origin='https://example.test', source_reader=lambda *_: None)
        accepted = self.ledger.accept(self.owner, question='计数预算合成问题', idempotency_key=str(uuid4()),
                                      bundle_hash='a'*64, model_id=MODEL).run
        row, credentials = gateway.claim(accepted['id'], execution_id=str(uuid4()))
        call = RunCall(row['id'], row['execution_id'], 1, 'S'*43, credentials.model)
        return gateway, row, call, factory

    def test_native_counted_preflights_only_charge_two_generation_permits(self):
        from test_counted_model_budget import count_reply, messages
        async def scenario():
            arrived, gate = [], asyncio.Event()
            async def counting(_):
                arrived.append(1)
                if len(arrived) == 4:
                    gate.set()
                await gate.wait()
                return count_reply(16384)
            gateway, row, call, factory = self.counted_gateway(counting=counting)
            async with asyncio.timeout(10):
                values = await asyncio.gather(*(gateway.model(call, messages()) for _ in range(4)), return_exceptions=True)
            self.assertEqual(sum(isinstance(value, dict) for value in values), 2)
            self.assertEqual(sum(isinstance(value, LedgerError) and value.code == 'AGENT_BUDGET_EXCEEDED' for value in values), 2)
            observed = self.ledger.get_owned(self.owner, row['id'])
            self.assertEqual((observed['model_count'], observed['model_input_tokens_reserved'], observed['model_input_tokens_observed']), (4, 32768, 32768))
            self.assertEqual((len(factory.count_requests), len(factory.generation_requests)), (4, 2))
        asyncio.run(scenario())

    def test_native_input_commit_ack_loss_never_dispatches_generation(self):
        from test_counted_model_budget import messages
        from src.modules.agent_runtime.model_budget import ModelJournal
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        gateway, row, call, factory = self.counted_gateway()
        original_reserve, original_commit = ModelJournal.reserve_input, MySQLUnitOfWork.commit
        stage, injected = threading.local(), []
        def reserve(journal, *args, **kwargs):
            value = original_reserve(journal, *args, **kwargs)
            stage.input = True
            return value
        def commit(uow):
            original_commit(uow)
            if getattr(stage, 'input', False) and not injected:
                stage.input = False
                injected.append(1)
                raise RuntimeError('synthetic input ACK loss')
        with patch.object(ModelJournal, 'reserve_input', reserve), patch.object(MySQLUnitOfWork, 'commit', commit):
            with self.assertRaises(LedgerError):
                asyncio.run(gateway.model(call, messages()))
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual((observed['model_count'], observed['model_input_tokens_reserved']), (1, 16384))
        self.assertEqual((len(factory.count_requests), len(factory.generation_requests)), (1, 0))
        attempt = self.pool.fetch_one('SELECT state,reserved_input_tokens FROM agent_model_calls WHERE run_id=%s', (row['id'],))
        self.assertEqual(attempt, {'state': 'unknown', 'reserved_input_tokens': 16384})

    def test_native_observation_commit_ack_loss_never_refunds_or_retries_provider(self):
        from src.modules.agent_runtime.gateway import RunCredentials
        from src.modules.agent_runtime.model_budget import ModelJournal
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        with patch('src.modules.agent_runtime.gateway.RunCredentials', return_value=RunCredentials('T'*43, 'M'*43, 'R'*43)):
            gateway, row, _, _ = self.gateway()
        call = RunCall(row['id'], row['execution_id'], 1, 'S'*43, 'M'*43)
        original_observe, original_commit = ModelJournal.observe, MySQLUnitOfWork.commit
        stage, injected, calls = threading.local(), [], []
        original_proxy = gateway.model_proxy
        async def proxy(body):
            calls.append(1)
            return await original_proxy(body)
        gateway.model_proxy = proxy
        def observe(journal, *args, **kwargs):
            result = original_observe(journal, *args, **kwargs)
            stage.observed = True
            return result
        def commit(uow):
            original_commit(uow)
            if getattr(stage, 'observed', False) and not injected:
                injected.append(1)
                raise RuntimeError('Synthetic post-commit observation ACK loss')
        with patch.object(ModelJournal, 'observe', observe), patch.object(MySQLUnitOfWork, 'commit', commit):
            with self.assertRaises(LedgerError):
                asyncio.run(gateway.model(call, {'messages': []}))
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(injected), 1)
        self.assertEqual((observed['model_count'], observed['model_output_tokens_reserved'],
                          observed['model_output_tokens_observed'], observed['model_usage_unknown_count']), (1, 1024, 5, 0))
        self.assertEqual(self.pool.fetch_one('SELECT state FROM agent_model_calls WHERE run_id=%s', (row['id'],))['state'], 'observed')

    def test_mysql_receipt_completion_and_real_collation_isolation(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiTextBlock
        from src.modules.ai.errors import AiDomainError
        gateway,row,tool,result=self.gateway()
        response=gateway.tool(tool,call_id='read',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        with self.assertRaises(LedgerError):self.finish(gateway,row,result,[response['source_id']])
        gateway.receipt(tool,call_id='read',result_hash=response['result_hash'])
        self.assertTrue(self.finish(gateway,row,result,[response['source_id']]))
        self.assertFalse(self.finish(gateway,row,result,[response['source_id']]))
        self.assertEqual(self.count('ai_messages'),2)
        alias=row['conversation_id'].replace('agent_','ágent_',1)
        self.assertEqual(self.pool.fetch_one('SELECT id FROM ai_conversations WHERE id=%s',(alias,))['id'],row['conversation_id'])
        repository=MySqlAiRepository(self.pool)
        with self.assertRaises(AiDomainError):repository._get_conversation(1,alias)
        with self.assertRaises(AiDomainError):repository._append_message(1,alias,'user',[AiTextBlock(text='invalid')])
        self.assertEqual(self.count('ai_messages'),2)

    def test_mysql_cancel_completion_race_leaves_one_terminal(self):
        gateway,row,tool,result=self.gateway()
        def finish():
            try:return self.finish(gateway,row,result,[])
            except LedgerError:return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            completed=pool.submit(finish)
            cancelled=pool.submit(self.ledger.cancel,self.owner,row['id'])
            completed.result();cancelled.result()
        state=self.ledger.get_owned(self.owner,row['id'])['status']
        self.assertIn(state,{'completed','cancelled'})
        self.assertEqual(self.count('ai_messages'),2 if state=='completed' else 1)

    def test_mysql_root_request_binding_and_internal_terminal_revoke(self):
        gateway, row, tool, result = self.gateway()
        gateway.bind_root_turn(result, 'root', root_request_id='request-native')
        with self.assertRaises(LedgerError):
            gateway.bind_root_turn(result, 'root', root_request_id='replaced')
        with self.assertRaises(LedgerError):
            gateway.finish(result, root_session_id=row['root_session_id'], root_turn_id='root',
                root_request_id='wrong', answer='回答', source_ids=[])
        self.assertEqual(self.count('ai_messages'), 1)
        self.assertEqual(self.ledger.end_execution(row['id'], execution_id=row['execution_id'],
            generation=1, status='interrupted'), 'interrupted')
        self.assertEqual(self.ledger.end_execution(row['id'], execution_id=row['execution_id'],
            generation=1, status='failed'), 'interrupted')
        with self.assertRaises(LedgerError):
            gateway.heartbeat(result)

    def test_mysql_dispatch_unknown_start_is_not_replayed_and_revokes_before_cancel(self):
        from src.modules.agent_runtime.dispatcher import RunDispatcher
        gateway, _row, _tool, _result = self.gateway()
        target = self.accept().run
        events = []
        ledger, owner = self.ledger, self.owner
        class Worker:
            async def start(inner, payload):
                row = ledger.get_owned(owner, target['id'])
                events.append(('start', row['status']))
                self.assertEqual(row['execution_id'], payload['execution_id'])
                self.assertIsNotNone(row['result_credential_hash'])
                raise OSError('synthetic lost dispatch acknowledgement')
            async def inspect(inner, binding):
                events.append(('inspect', binding['execution_id']))
                raise OSError('synthetic unknown execution')
            async def cancel(inner, binding):
                events.append(('cancel', ledger.get_owned(owner, target['id'])['status']))
                return {**binding, 'status': 'cancelled'}
        async def exercise():
            dispatcher = RunDispatcher(gateway, Worker(), worker_credential='S'*43)
            try:
                state = await dispatcher.dispatch(target['id'], question='原始问题')
                self.assertEqual(state['status'], 'interrupted')
                self.assertIsNone(await dispatcher.dispatch(target['id'], question='原始问题'))
            finally:
                await dispatcher.aclose()
        asyncio.run(exercise())
        self.assertEqual([event[0] for event in events], ['start', 'inspect', 'cancel'])
        self.assertEqual(events[0][1], 'running')
        self.assertEqual(events[2][1], 'interrupted')

    def test_mysql_failed_run_update_rolls_back_message_insert(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        gateway,row,tool,result=self.gateway()
        original=MySQLUnitOfWork.execute
        def failed(uow,sql,params=None):
            if sql.startswith("UPDATE agent_runs SET status='completed'"):raise RuntimeError('synthetic failure')
            return original(uow,sql,params)
        with patch.object(MySQLUnitOfWork,'execute',failed),self.assertRaises(RuntimeError):
            self.finish(gateway,row,result,[])
        self.assertEqual(self.count('ai_messages'),1)
        self.assertEqual(self.ledger.get_owned(self.owner,row['id'])['status'],'running')

    def test_mysql_live_authorization_reuses_uow_after_committed_role_change(self):
        from src.controller.user_manage import UserManager
        user=UserManager(self.pool)
        with self.ledger.unit_of_work() as uow:
            self.assertEqual(user.get_auth_context(1,uow=uow)['roles'],[{'code':'admin'}])
            with self.admin.cursor() as cursor:cursor.execute('DELETE FROM user_roles WHERE user_id=1')
            self.assertEqual(user.get_auth_context(1,uow=uow)['roles'],[])

    def test_mysql_small_pool_waiter_does_not_block_auth_or_source_revalidation(self):
        entered,waiter_started,release=threading.Event(),threading.Event(),threading.Event()
        active=[False]
        def authorize(uow,row):
            account=uow.fetch_one('SELECT id,status FROM users WHERE id=%s',(row['user_id'],))
            return self.owner if account['status']==1 else None
        def source(uow,principal,article_id):
            # Pause inside the final transaction, not the finish preflight.
            if active[0] and not entered.is_set():
                entered.set()
                if not release.wait(5):raise AssertionError('waiter not scheduled')
            uow.fetch_one('SELECT id FROM users WHERE id=1')
            content='原始公开正文'
            return dict(article_id=1,title='原始标题',content=content,content_hash=digest({'article_id':1,'title':'原始标题','content':content}),
                        content_bytes=len(content.encode()),returned_bytes=len(content.encode()),truncated=False)
        gateway,row,tool,result=self.gateway(authorize,source)
        response=gateway.tool(tool,call_id='read',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        gateway.receipt(tool,call_id='read',result_hash=response['result_hash'])
        active[0]=True
        waiting_thread = []
        def waiter():
            with self.ledger.unit_of_work() as uow:
                waiting_thread.append(uow.connection.thread_id())
                waiter_started.set()
                return uow.fetch_one('SELECT id FROM agent_runs WHERE id=%s FOR UPDATE',(row['id'],))
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(self.finish,gateway,row,result,[response['source_id']])
            self.assertTrue(entered.wait(5))
            second=pool.submit(waiter)
            self.assertTrue(waiter_started.wait(5))
            try:
                deadline = time.monotonic()+2
                while True:
                    with self.admin.cursor() as cursor:
                        cursor.execute("SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id=%s AND trx_state='LOCK WAIT'",(waiting_thread[0],))
                        blocked = cursor.fetchone()[0]
                    if blocked:break
                    if time.monotonic()>=deadline:self.fail('waiter never entered actual InnoDB lock wait')
                    time.sleep(.02)
            finally:
                release.set()
            self.assertTrue(first.result(timeout=8))
            self.assertEqual(second.result(timeout=8)['id'],row['id'])

    def real_session(self):
        from src.controller.auth_manager import AuthManager
        from src.controller.user_manage import UserManager
        from src.core.auth.session import SessionAuthenticator
        from src.modules.agent_runtime.session_authorizer import RunSessionAuthorizer, RunAllowlistPolicy
        from test_auth_manager import StatefulRedis
        auth=AuthManager(UserManager(self.pool),StatefulRedis(),secret_key='synthetic-mysql-session-key-only')
        tokens=auth.create_tokens_for_user('1',str(uuid4()))
        self.owner=SessionAuthenticator(auth).authenticate(tokens.access_token)
        authorizer=RunSessionAuthorizer(auth)
        self.addCleanup(authorizer.close)
        return auth,tokens,authorizer,RunAllowlistPolicy([1])

    def test_mysql_real_session_refresh_then_role_revocation_is_seen(self):
        auth,tokens,authorizer,policy=self.real_session()
        gateway,row,tool,result=self.gateway(authorizer,allow=policy,
            bind=lambda accepted:authorizer.bind(accepted,tokens.access_token))
        fresh=auth.refresh_access_token(tokens.refresh_token)
        self.assertIsNotNone(fresh)
        response=gateway.tool(tool,call_id='read',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        self.assertIsNotNone(response['source_id'])
        with self.admin.cursor() as cursor:cursor.execute('DELETE FROM user_roles WHERE user_id=1')
        with self.assertRaises(LedgerError):
            gateway.tool(tool,call_id='blocked',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        self.assertEqual(self.ledger.get_owned(self.owner,row['id'])['tool_count'],1)

    def test_mysql_account_disable_during_final_source_read_rolls_back_answer(self):
        auth,tokens,authorizer,policy=self.real_session()
        gateway,row,tool,result=self.gateway(authorizer,allow=policy,
            bind=lambda accepted:authorizer.bind(accepted,tokens.access_token))
        response=gateway.tool(tool,call_id='read',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        gateway.receipt(tool,call_id='read',result_hash=response['result_hash'])
        original=gateway.source_reader
        def disabling(uow,principal,article_id):
            current=original(uow,principal,article_id)
            with self.admin.cursor() as cursor:cursor.execute('UPDATE users SET status=0 WHERE id=1')
            return current
        gateway.source_reader=disabling
        with self.assertRaises(LedgerError):self.finish(gateway,row,result,[response['source_id']])
        self.assertEqual(self.count('ai_messages'),1)
        self.assertEqual(self.ledger.get_owned(self.owner,row['id'])['status'],'running')

    def test_mysql_restart_loses_binding_and_reconciles_expired_run_without_replay(self):
        from src.core.auth import AuthorizationDenied
        from src.modules.agent_runtime.session_authorizer import RunSessionAuthorizer
        auth,tokens,authorizer,policy=self.real_session()
        gateway,row,tool,result=self.gateway(authorizer,allow=policy,
            bind=lambda accepted:authorizer.bind(accepted,tokens.access_token))
        restarted=RunSessionAuthorizer(auth)
        self.addCleanup(restarted.close)
        with self.ledger.unit_of_work() as uow,self.assertRaises(AuthorizationDenied):restarted(uow,row)
        self.time+=timedelta(seconds=46)
        self.assertEqual(self.ledger.reconcile(),[row['id']])
        self.assertEqual(self.ledger.get_owned(self.owner,row['id'])['status'],'interrupted')
        self.assertIsNone(self.ledger.claim(row['id'],execution_id=str(uuid4())))

    def test_empty_or_prequery_failed_rc_uow_does_not_leak_next_isolation(self):
        single=SocketManager(self.socket,self.database,pool_size=1)
        self.addCleanup(single.close)
        ledger=MySqlRunLedger(single,clock=lambda:self.time)
        for failed in (False,True):
            with self.subTest(prequery_error=failed):
                with self.admin.cursor() as cursor:cursor.execute('UPDATE users SET status=1 WHERE id=1')
                if failed:
                    with self.assertRaises(LedgerError):ledger.get_owned(self.owner,'not-a-uuid')
                else:
                    with ledger.unit_of_work():pass
                # One connection forces the very same physical session to be
                # reused, so another idle pooled connection cannot hide a leak.
                with single.unit_of_work() as uow:
                    self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'],1)
                    with self.admin.cursor() as cursor:cursor.execute('UPDATE users SET status=0 WHERE id=1')
                    self.assertEqual(uow.fetch_one('SELECT status FROM users WHERE id=1')['status'],1)

    def test_real_public_source_facade_reuses_current_connection(self):
        from src.modules.blog.public import create_public_tools
        self.pool.execute("INSERT INTO blog(id,title,author) VALUES(%s,%s,%s)",(1,'原始标题','synthetic'))
        class Content:
            def find_one(self,collection,query):
                return {'blogId':1,'content':'原始公开正文'} if query.get('blogId')==1 else None
        def source(uow,principal,article_id):
            # An actual module facade, real MySQL metadata/tags and synthetic
            # Mongo content. Any accidental second pool borrow fails the test.
            with patch.object(self.pool,'_borrow',side_effect=AssertionError('nested pool borrow')):
                return create_public_tools(uow,Content()).read_public(principal,{'article_id':article_id})
        gateway,row,tool,result=self.gateway(source_reader=source)
        response=gateway.tool(tool,call_id='read',tool_id='blog.read_public',tool_version='1',arguments={'article_id':1})
        gateway.receipt(tool,call_id='read',result_hash=response['result_hash'])
        self.assertTrue(self.finish(gateway,row,result,[response['source_id']]))
        self.assertEqual(self.count('ai_messages'),2)

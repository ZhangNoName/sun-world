"""Owned native MySQL upgrades from SYNTHETIC cuts of MYSQL_SCHEMA.

Neither fixture is a production snapshot or a claim about a historical release.
Without the owned launcher's environment this file never connects to a server.
"""

import copy
from datetime import datetime, timedelta
import io
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from uuid import uuid4

import pymysql

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.database.mysql import schema_migration as migration

RUN_BUDGET_COLUMNS = frozenset({
    'model_input_bytes', 'model_input_tokens_reserved', 'model_output_tokens_reserved',
    'model_response_bytes_reserved', 'model_input_tokens_observed', 'model_output_tokens_observed',
    'model_response_bytes_observed', 'model_usage_unknown_count',
})
CALL_BUDGET_COLUMNS = frozenset({'reserved_input_tokens', 'wire_request_hash', 'count_request_hash', 'input_reserved_at'})
RUN_EXTENSION_COLUMNS = RUN_BUDGET_COLUMNS | {'history_deleted_at'}
BUSINESS_ROWS = ('users', 'roles', 'user_roles', 'dictionary_types', 'dictionary_items', 'ai_conversations', 'ai_messages')
STAMP = datetime(2026, 11, 16, 12, 0, 0, 123456)


def synthetic_schema(*, no_agent=False):
    schema = copy.deepcopy(migration.MYSQL_SCHEMA)
    if no_agent:
        return {name: definition for name, definition in schema.items() if not name.startswith('agent_')}
    for table, missing in (('agent_runs', RUN_EXTENSION_COLUMNS), ('agent_model_calls', CALL_BUDGET_COLUMNS)):
        present = {column['name'] for column in schema[table]['columns']}
        if not missing <= present:
            raise AssertionError('Synthetic schema cut no longer matches the central contract')
        schema[table]['columns'] = [column for column in schema[table]['columns'] if column['name'] not in missing]
    return schema


def verified_socket():
    """Attest the explicit private launcher directory before opening its socket."""
    try:
        directory = Path(os.environ['SUN_WORLD_AGENT_MYSQL_ROOT'])
        info = directory.lstat()
        if (not directory.is_absolute() or not stat.S_ISDIR(info.st_mode) or directory.is_symlink()
                or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
                or not directory.name.startswith('sunworld-agent-mysql-')):
            raise ValueError
        directory = directory.resolve(strict=True)
        descriptor = os.open(directory / 'owner.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(descriptor)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 4096):
                raise ValueError
            raw = os.read(descriptor, 4097)
        finally:
            os.close(descriptor)
        if len(raw) > 4096:
            raise ValueError
        marker = json.loads(raw)
        nonce = os.environ['SUN_WORLD_AGENT_MYSQL_NONCE']
        if (type(marker.get('nonce')) is not str or re.fullmatch(r'[0-9a-f]{64}', nonce) is None
                or not secrets.compare_digest(marker['nonce'], nonce)
                or marker.get('data') != str(directory / 'data') or marker.get('socket') != str(directory / 'mysql.sock')):
            raise ValueError
        socket = str(directory / 'mysql.sock')
        with pymysql.connect(unix_socket=socket, user='root', password='', connect_timeout=2,
                             read_timeout=5, write_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT @@datadir,@@socket,@@skip_networking')
                actual_data, actual_socket, disabled = cursor.fetchone()
                if (Path(actual_data).resolve() != directory / 'data'
                        or Path(actual_socket).resolve() != Path(socket) or type(disabled) is not int or disabled != 1):
                    raise ValueError
        return socket
    except Exception:
        raise RuntimeError('Owned MySQL upgrade fixture proof is invalid') from None


class SyntheticUpgradeFixtureTests(unittest.TestCase):
    def test_cuts_are_independent_of_the_central_schema(self):
        before = copy.deepcopy(migration.MYSQL_SCHEMA)
        business, budgets = synthetic_schema(no_agent=True), synthetic_schema()
        self.assertFalse(any(name.startswith('agent_') for name in business))
        self.assertEqual(set(budgets), set(before))
        for table, removed in (('agent_runs', RUN_EXTENSION_COLUMNS), ('agent_model_calls', CALL_BUDGET_COLUMNS)):
            self.assertEqual(removed, {column['name'] for column in before[table]['columns']}
                - {column['name'] for column in budgets[table]['columns']})
        budgets['users']['columns'][0]['definition'] = 'synthetic change'
        self.assertEqual(before, migration.MYSQL_SCHEMA)

    def test_missing_owned_environment_never_attempts_a_database_connection(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(pymysql, 'connect') as connect:
            with self.assertRaisesRegex(RuntimeError, '^Owned MySQL upgrade fixture proof is invalid$'):
                verified_socket()
        connect.assert_not_called()


@unittest.skipUnless(os.getenv('SUN_WORLD_AGENT_MYSQL_ROOT'), 'Use the owned scripts/test-agent-mysql.py launcher')
class AgentMySQLUpgradeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.socket = verified_socket()

    def connect(self, database=None):
        return pymysql.connect(unix_socket=self.socket, user='root', password='', database=database,
            autocommit=True, cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=2, read_timeout=5, write_timeout=5)

    def setUp(self):
        self.database = 'sunworld_upgrade_' + uuid4().hex[:16]
        self.connection = self.connect()
        self.addCleanup(self.connection.close)
        with self.connection.cursor() as cursor:
            cursor.execute('CREATE DATABASE ' + migration.quote_identifier(self.database)
                + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
        self.addCleanup(self.drop_database)
        self.connection.select_db(self.database)

    def drop_database(self):
        if re.fullmatch(r'sunworld_upgrade_[0-9a-f]{16}', self.database) is None:
            raise RuntimeError('Invalid disposable upgrade database identity')
        with self.connection.cursor() as cursor:
            cursor.execute('DROP DATABASE ' + migration.quote_identifier(self.database))

    def execute(self, sql, parameters=()):
        with self.connection.cursor() as cursor:
            cursor.execute(sql, parameters)

    def rows(self, sql, parameters=()):
        with self.connection.cursor() as cursor:
            cursor.execute(sql, parameters)
            return list(cursor.fetchall())

    def insert(self, table, values):
        columns = ','.join(migration.quote_identifier(name) for name in values)
        self.execute('INSERT INTO ' + migration.quote_identifier(table) + ' (' + columns + ') VALUES ('
            + ','.join('%s' for _ in values) + ')', tuple(values.values()))

    def install(self, schema):
        for table, definition in schema.items():
            self.execute(migration.build_create_table_sql(table, definition))
        self.insert('users', dict(id=1, username='synthetic_upgrade', name='合成升级用户',
            email='upgrade@example.invalid', password='synthetic-unused-password', status=1))
        self.insert('roles', dict(id=1, name='合成角色', code='synthetic-upgrade'))
        self.insert('user_roles', dict(user_id=1, role_id=1))
        self.insert('dictionary_types', dict(id=1, code='synthetic-upgrade', name='合成字典'))
        self.insert('dictionary_items', dict(id=1, dictionary_type_id=1, value='one', label='合成词条'))
        self.history('conv_synthetic_upgrade')
        if 'agent_runs' in schema:
            for state in ('observed', 'unknown'):
                run_id, conversation = str(uuid4()), 'agent_conv_' + uuid4().hex
                self.history(conversation, completed=state == 'observed')
                self.insert('agent_runs', dict(id=run_id, user_id=1, idempotency_key=str(uuid4()),
                    request_hash='a' * 64, conversation_id=conversation, session_family_hash='b' * 64,
                    engine='dsh', bundle_hash='c' * 64, model_id='synthetic-upgrade-model',
                    status='completed' if state == 'observed' else 'running', execution_id=str(uuid4()),
                    root_session_id='blog-qa-' + run_id, root_request_id='synthetic-root-request',
                    model_count=1, deadline=STAMP + timedelta(seconds=45), accepted_at=STAMP, updated_at=STAMP))
                self.insert('agent_model_calls', dict(run_id=run_id, generation=1, call_id=str(uuid4()),
                    request_hash='d' * 64, input_bytes=50, reserved_output_tokens=1024,
                    reserved_response_bytes=65536, state=state, input_tokens=12 if state == 'observed' else None,
                    output_tokens=7 if state == 'observed' else None, response_bytes=100 if state == 'observed' else None,
                    result_hash='e' * 64 if state == 'observed' else None, reserved_at=STAMP, updated_at=STAMP))

    def history(self, conversation, *, completed=True):
        self.insert('ai_conversations', dict(id=conversation, user_id=1, title='合成旧历史', created_at=STAMP, updated_at=STAMP))
        for sequence, role in ((1, 'user'), (2, 'assistant')) if completed else ((1, 'user'),):
            self.insert('ai_messages', dict(id='message_' + uuid4().hex, conversation_id=conversation,
                role=role, blocks=json.dumps([{'type': 'text', 'content_type': 'text/plain', 'text': '合成历史内容'}]),
                sequence=sequence, created_at=STAMP, updated_at=STAMP))

    def snapshot(self, schema):
        tables = [*BUSINESS_ROWS, *(['agent_runs', 'agent_model_calls'] if 'agent_runs' in schema else [])]
        return {table: self.rows('SELECT ' + ','.join(migration.quote_identifier(column['name'])
            for column in schema[table]['columns']) + ' FROM ' + migration.quote_identifier(table)
            + ' ORDER BY ' + ','.join(migration.quote_identifier(name) for name in schema[table]['primary_key'])) for table in tables}

    def ddl_snapshot(self):
        tables = migration.fetch_existing_tables(self.connection, self.database)
        return {table: self.rows('SHOW CREATE TABLE ' + migration.quote_identifier(table))[0]['Create Table'] for table in sorted(tables)}

    def assert_converged(self):
        self.assertEqual([], migration.validate_schema(self.connection, self.database))
        self.assertEqual(([], []), migration.build_plan(self.connection, self.database))

    def assert_new_defaults(self):
        run_values = self.rows('SELECT ' + ','.join(sorted(RUN_BUDGET_COLUMNS)) + ' FROM agent_runs')
        self.assertEqual(2, len(run_values))
        self.assertTrue(all(type(value) is int and value == 0 for row in run_values for value in row.values()))
        self.assertTrue(all(row['history_deleted_at'] is None
            for row in self.rows('SELECT history_deleted_at FROM agent_runs')))
        calls = self.rows('SELECT state,input_tokens,' + ','.join(sorted(CALL_BUDGET_COLUMNS)) + ' FROM agent_model_calls')
        self.assertEqual({'observed', 'unknown'}, {row['state'] for row in calls})
        self.assertTrue(all(row[name] is None for row in calls for name in CALL_BUDGET_COLUMNS))
        self.assertEqual(12, next(row for row in calls if row['state'] == 'observed')['input_tokens'])

    def test_synthetic_business_without_agent_tables_upgrades_and_preserves_records(self):
        schema = synthetic_schema(no_agent=True)
        self.install(schema)
        before = self.snapshot(schema)
        actions, errors = migration.build_plan(self.connection, self.database)
        self.assertEqual([], errors)
        self.assertEqual(len(migration.MYSQL_SCHEMA) - len(schema), len(actions))
        migration.apply_plan(self.connection, actions)
        self.assertEqual(before, self.snapshot(schema))
        self.assert_converged()
        for table in set(migration.MYSQL_SCHEMA) - set(schema):
            self.assertEqual([], self.rows('SELECT * FROM ' + migration.quote_identifier(table)))

    def test_synthetic_agent_budget_extension_preserves_observed_and_unknown_calls(self):
        schema = synthetic_schema()
        self.install(schema)
        before = self.snapshot(schema)
        actions, errors = migration.build_plan(self.connection, self.database)
        self.assertEqual([], errors)
        self.assertEqual(len(RUN_EXTENSION_COLUMNS) + len(CALL_BUDGET_COLUMNS), len(actions))
        migration.apply_plan(self.connection, actions)
        self.assertEqual(before, self.snapshot(schema))
        self.assert_new_defaults()
        self.assert_converged()
        migration.apply_plan(self.connection, [])
        self.assertEqual(before, self.snapshot(schema))

    def test_partial_ddl_server_failure_survives_rollback_and_fresh_plan_converges(self):
        schema = synthetic_schema()
        self.install(schema)
        before = self.snapshot(schema)
        actions, errors = migration.build_plan(self.connection, self.database)
        self.assertEqual([], errors)
        self.connection.autocommit(False)
        try:
            with self.assertRaises(pymysql.MySQLError):
                migration.apply_plan(self.connection, [actions[0], 'SYNTHETIC_INVALID_DDL_STATEMENT'])
            self.connection.rollback()  # This cannot undo MySQL's committed DDL prefix.
        finally:
            self.connection.autocommit(True)
        with self.connect(self.database) as fresh:
            remaining, errors = migration.build_plan(fresh, self.database)
            self.assertEqual([], errors)
            self.assertEqual(actions[1:], remaining)
            migration.apply_plan(fresh, remaining)
            self.assertEqual([], migration.validate_schema(fresh, self.database))
        self.assertEqual(before, self.snapshot(schema))
        self.assert_new_defaults()
        self.assert_converged()

    def assert_rejected_without_ddl(self, schema, expected):
        self.install(schema)
        before, ddl = self.snapshot(schema), self.ddl_snapshot()
        actions, errors = migration.build_plan(self.connection, self.database)
        self.assertTrue(actions, 'A rejection must also block otherwise executable missing-table actions')
        self.assertTrue(any(expected in error for error in errors), errors)
        # Exercise the formal orchestration with an attested owned connection;
        # the config reader and connector are never allowed to run their IO.
        connection = self.connect(self.database)
        with patch.object(migration, 'load_api_config', return_value={'mysql': {'db': self.database}}), \
                patch.object(migration, 'connect_mysql', return_value=connection), \
                patch.object(migration, 'apply_plan', wraps=migration.apply_plan) as apply, redirect_stdout(io.StringIO()):
            self.assertEqual(1, migration.run_database_mode('apply'))
            apply.assert_not_called()
        self.assertEqual(before, self.snapshot(schema))
        self.assertEqual(ddl, self.ddl_snapshot())
        self.assertTrue(migration.validate_schema(self.connection, self.database))

    def test_incompatible_existing_column_blocks_all_pending_ddl(self):
        schema = synthetic_schema(no_agent=True)
        next(column for column in schema['users']['columns'] if column['name'] == 'age')['definition'] = 'SMALLINT NOT NULL DEFAULT 0'
        self.assert_rejected_without_ddl(schema, 'users.age has type')

    def test_missing_required_index_blocks_all_pending_ddl(self):
        schema = synthetic_schema(no_agent=True)
        schema['users']['indexes'] = [index for index in schema['users']['indexes'] if 'idx_users_email' not in index]
        self.assert_rejected_without_ddl(schema, 'missing required index idx_users_email')

    def test_incompatible_index_uniqueness_blocks_all_pending_ddl(self):
        schema = synthetic_schema(no_agent=True)
        schema['users']['indexes'] = [index.replace('UNIQUE KEY', 'KEY') if 'idx_users_email' in index else index
                                     for index in schema['users']['indexes']]
        self.assert_rejected_without_ddl(schema, 'idx_users_email uniqueness')

    def test_missing_foreign_key_blocks_all_pending_ddl(self):
        schema = synthetic_schema(no_agent=True)
        schema['dictionary_items']['constraints'] = []
        self.assert_rejected_without_ddl(schema, 'missing required foreign key fk_dictionary_items_type')

    def test_incompatible_foreign_key_rule_blocks_all_pending_ddl(self):
        schema = synthetic_schema(no_agent=True)
        schema['dictionary_items']['constraints'] = [constraint.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE')
                                                   for constraint in schema['dictionary_items']['constraints']]
        self.assert_rejected_without_ddl(schema, 'fk_dictionary_items_type delete_rule')


if __name__ == '__main__':
    unittest.main()

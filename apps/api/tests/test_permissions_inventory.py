import contextlib
import importlib.util
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.core.auth.permissions_inventory import audit_read_only_connection, read_permissions_inventory


class SqliteCursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, sql, params=()):
        self.cursor.execute(sql.replace('%s', '?'), params)

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]


class PermissionsInventoryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            CREATE TABLE users(id INTEGER PRIMARY KEY, status INTEGER);
            CREATE TABLE roles(id INTEGER PRIMARY KEY, code TEXT);
            CREATE TABLE resources(id INTEGER PRIMARY KEY, code TEXT);
            CREATE TABLE user_roles(user_id INTEGER, role_id INTEGER);
            CREATE TABLE role_resources(role_id INTEGER, resource_id INTEGER);
            INSERT INTO users VALUES(1,1),(2,1),(3,0);
            INSERT INTO roles VALUES(1,' \tADMIN\u3000'),(2,'normal');
            INSERT INTO resources VALUES(1,'article.read');
            INSERT INTO user_roles VALUES(1,1),(2,2),(3,1);
            INSERT INTO role_resources VALUES(1,1);
        ''')
        self.cursor = SqliteCursor(self.db)

    def test_real_queries_normalize_like_guard_and_emit_only_aggregates(self):
        report = read_permissions_inventory(self.cursor)
        self.assertEqual(report['counts']['enabled_administrators'], 1)
        self.assertEqual(report['counts']['users'], 3)
        self.assertEqual(report['findings'], [])
        self.assertEqual(report['warnings'], ['single_enabled_administrator'])
        self.assertEqual(report['administrator_recovery'], 'unverified')
        serialized = json.dumps(report)
        self.assertNotIn('ADMIN', serialized)
        self.assertNotIn('article.read', serialized)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM user_roles').fetchone()[0], 3)

    def test_detects_duplicates_empty_codes_orphans_without_double_counting_admins(self):
        self.db.executescript('''
            INSERT INTO roles VALUES(4,'admin'),(5,NULL),(6,'\t');
            INSERT INTO resources VALUES(2,' ARTICLE.READ '),(3,NULL);
            INSERT INTO user_roles VALUES(1,4),(1,1),(999,1),(1,999);
            INSERT INTO role_resources VALUES(1,1),(999,1),(1,999);
        ''')
        counts = read_permissions_inventory(self.cursor)['counts']
        self.assertEqual(counts['enabled_administrators'], 1)
        self.assertEqual(counts['duplicate_role_codes'], 2)
        self.assertEqual(counts['empty_role_codes'], 2)
        self.assertEqual(counts['duplicate_resource_codes'], 1)
        self.assertEqual(counts['dangling_user_role_bindings'], 2)
        self.assertEqual(counts['dangling_role_resource_bindings'], 2)
        self.assertEqual(counts['duplicate_user_role_bindings'], 1)
        self.assertEqual(counts['duplicate_role_resource_bindings'], 1)

    def test_no_enabled_admin_is_reported_and_resource_rows_never_create_one(self):
        self.db.execute('UPDATE users SET status=0 WHERE id=1')
        self.db.execute("INSERT INTO resources VALUES(2,'admin')")
        report = read_permissions_inventory(self.cursor)
        self.assertEqual(report['counts']['enabled_administrators'], 0)
        self.assertIn('no_enabled_administrator', report['findings'])

    def test_read_only_snapshot_never_commits_and_rolls_back_on_failure(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'count': 5}
        with patch('src.core.auth.permissions_inventory.read_permissions_inventory', return_value={'counts': {}}):
            self.assertEqual(audit_read_only_connection(connection), {'counts': {}})
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertEqual(statements[:2], ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
                                         'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'])
        connection.commit.assert_not_called()
        connection.rollback.assert_called_once()
        connection.reset_mock()
        cursor.fetchone.return_value = {'count': 4}
        with self.assertRaises(ValueError):
            audit_read_only_connection(connection)
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    def load_script(self):
        spec = importlib.util.spec_from_file_location('local_permission_audit', ROOT / 'scripts/audit-local-permissions.py')
        script = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(script)
        return script

    def test_production_mode_rejected_before_opening_config_or_connection(self):
        script = self.load_script()
        with patch.dict(os.environ, {'BLOG_RUNTIME_ENV': 'production'}), patch('pathlib.Path.read_text') as read:
            with self.assertRaises(ValueError):
                script.load_mysql_settings()
            read.assert_not_called()

    def test_exact_local_config_merge_does_not_load_ai_or_arbitrary_override(self):
        script = self.load_script()
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'BLOG_RUNTIME_ENV': 'local',
                                                'BLOG_CONFIG_OVERRIDE': '/forbidden/production-secret.yml'}):
            root = Path(temp)
            directory = root / 'apps/api/src/conf'
            directory.mkdir(parents=True)
            (directory / 'local.yml').write_text('mysql: {ip: localhost, port: 3306, db: synthetic, user: example, password: base}\n')
            (directory / 'local.override.yml').write_text('mysql: {password: synthetic-override}\n')
            (directory / 'local.ai-credentials.yml').write_text('invalid YAML: [')
            settings = script.load_mysql_settings(root)
            self.assertEqual(settings['password'], 'synthetic-override')
            self.assertEqual(settings['database'], 'synthetic')

    def test_cli_redacts_driver_errors(self):
        script = self.load_script()
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['audit-local-permissions.py', '--local']), \
             patch.object(script, 'load_mysql_settings', side_effect=ValueError('private-password')), \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            self.assertEqual(script.main(), 1)
        self.assertEqual(output.getvalue(), '')
        self.assertNotIn('private-password', errors.getvalue())

    def test_malformed_count_or_oversized_definitions_cannot_produce_clean_report(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'count': True}
        with self.assertRaises(ValueError):
            read_permissions_inventory(cursor)
        with patch('src.core.auth.permissions_inventory.MAX_DEFINITIONS', 1):
            with self.assertRaises(ValueError):
                read_permissions_inventory(self.cursor)

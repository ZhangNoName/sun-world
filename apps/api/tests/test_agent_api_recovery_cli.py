"""Recovery profile must never fall through to a paid or Linux model suite."""

from contextlib import nullcontext, redirect_stderr
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))


def launcher():
    spec = importlib.util.spec_from_file_location('api_recovery_cli', ROOT / 'scripts/test-agent-sdk-stack.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ApiRecoveryCliTests(unittest.TestCase):
    def base(self, root):
        return [argument for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node')
                for argument in ('--' + name, str(root))]

    def test_conflicts_and_missing_report_refuse_before_resource_or_node_access(self):
        cli = launcher()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [[], ['--real-model'], ['--real-model-profile', 'openai-local'],
                     ['--interrupt-probe'], ['--linux-stack'], ['--linux-official']]
            with patch.object(cli.sys, 'platform', 'darwin'), patch.object(cli, 'load') as load, \
                    patch.object(cli.subprocess, 'check_output') as execute, redirect_stderr(io.StringIO()):
                for flags in cases:
                    report = ['--report', str(root / 'report.json')] if flags else []
                    self.assertEqual(1, cli.main(self.base(root) + ['--api-process-recovery'] + report + flags))
                load.assert_not_called()
                execute.assert_not_called()

    def test_existing_and_dangling_reports_refuse_without_following_or_overwriting(self):
        cli = launcher()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            existing, dangling = root / 'existing', root / 'dangling'
            existing.write_text('owned evidence must survive')
            dangling.symlink_to(root / 'missing')
            with patch.object(cli.sys, 'platform', 'darwin'), patch.object(cli, 'load') as load, \
                    patch.object(cli.subprocess, 'check_output') as execute, redirect_stderr(io.StringIO()):
                for destination in (existing, dangling):
                    self.assertEqual(1, cli.main(self.base(root) + ['--api-process-recovery', '--report', str(destination)]))
                load.assert_not_called()
                execute.assert_not_called()
            self.assertEqual('owned evidence must survive', existing.read_text())
            self.assertTrue(dangling.is_symlink())
            self.assertFalse((root / 'missing').exists())

    def test_recovery_forwards_only_synthetic_child_with_same_owned_database_wrappers(self):
        cli = launcher()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mysql = SimpleNamespace(run=Mock(return_value=0))
            redis = SimpleNamespace(owned_redis=lambda _: nullcontext({'SYNTHETIC_REDIS': 'owned'}))
            mongo = SimpleNamespace(owned_mongo=lambda _: nullcontext({'SYNTHETIC_MONGO': 'owned'}))
            with patch.object(cli.sys, 'platform', 'darwin'), patch.dict(os.environ, BLOG_RUNTIME_ENV='test'), \
                    patch.object(cli, 'load', side_effect=[mysql, redis, mongo]), \
                    patch.object(cli.subprocess, 'check_output', return_value='v' + (ROOT / '.nvmrc').read_text().strip()):
                result = cli.main(self.base(root) + ['--api-process-recovery', '--report', str(root / 'report.json')])
            self.assertEqual(0, result)
            command = mysql.run.call_args.kwargs['test_command']
            self.assertEqual([sys.executable, str(ROOT / 'apps/api/tests/integration/api_process_recovery.py'),
                              '--report', str(root.resolve() / 'report.json')], command)
            self.assertEqual({'SYNTHETIC_REDIS': 'owned', 'SYNTHETIC_MONGO': 'owned',
                              'SUN_WORLD_AGENT_SDK_RUNTIME': str(root.resolve()), 'SUN_WORLD_AGENT_SDK_NODE': str(root.resolve())},
                             mysql.run.call_args.kwargs['extra_env'])

    def test_report_directory_must_be_private_before_any_server_is_started(self):
        cli = launcher()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.chmod(0o755)
            with patch.object(cli.sys, 'platform', 'darwin'), patch.object(cli, 'load') as load, \
                    patch.object(cli.subprocess, 'check_output') as execute, redirect_stderr(io.StringIO()):
                self.assertEqual(1, cli.main(self.base(root) + ['--api-process-recovery', '--report', str(root / 'report.json')]))
                load.assert_not_called()
                execute.assert_not_called()
            self.assertFalse((root / 'report.json').exists())


if __name__ == '__main__':
    unittest.main()

"""Contract export admission/early-write faults; no database or SDK startup."""

from contextlib import redirect_stderr
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WebContractAdmissionTests(unittest.TestCase):
    def test_wrong_platform_existing_dangling_or_public_report_refuses_before_resources(self):
        cli = load('web_contract_admission', 'scripts/test-agent-web-contract.py')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            base = [argument for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node')
                    for argument in ('--' + name, str(root))]
            existing, dangling = root / 'existing', root / 'dangling'
            existing.write_text('existing evidence')
            dangling.symlink_to(root / 'missing')
            for platform, path, public in [('linux', root / 'new', False), ('darwin', existing, False),
                    ('darwin', dangling, False), ('darwin', root / 'new', True)]:
                root.chmod(0o755 if public else 0o700)
                with patch.object(cli.sys, 'platform', platform), patch.object(cli, 'load') as resources, \
                        patch.object(cli.subprocess, 'check_output') as execute, redirect_stderr(io.StringIO()):
                    self.assertEqual(1, cli.main(base + ['--report', str(path)]))
                    resources.assert_not_called()
                    execute.assert_not_called()
            self.assertEqual('existing evidence', existing.read_text())
            self.assertTrue(dangling.is_symlink())
            self.assertFalse((root / 'missing').exists())

    def test_unknown_cli_values_never_enter_diagnostics(self):
        cli = load('web_contract_arguments', 'scripts/test-agent-web-contract.py')
        arguments = [argument for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node', 'report')
                     for argument in ('--' + name, '/unused')]
        output = io.StringIO()
        with redirect_stderr(output), self.assertRaises(SystemExit) as error:
            cli.main(arguments + ['--unknown', 'PRIVATE_SYNTHETIC_ARGUMENT'])
        self.assertEqual(2, error.exception.code)
        self.assertEqual('AGENT_WEB_CONTRACT_FAILED\n', output.getvalue())


class WebContractEarlyWriteTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_initial_report_write_allocates_neither_fixture_nor_database(self):
        contract = load('web_contract_early_write', 'apps/api/tests/integration/web_contract.py')
        output = Mock()
        output.seek.side_effect = OSError('PRIVATE_SYNTHETIC_ERROR')
        with patch.object(contract.stack.AgentStackTests, 'setUpClass') as database, \
                patch.object(contract, 'WebFixture') as fixture, self.assertRaises(OSError):
            await contract.capture(output)
        database.assert_not_called()
        fixture.assert_not_called()


if __name__ == '__main__':
    unittest.main()

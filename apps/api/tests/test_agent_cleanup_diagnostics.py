"""Pure diagnostics: no SDK, native database, network or business config."""

import asyncio
import errno
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('fixture_cleanup_diagnostics',
    ROOT / 'apps/api/tests/integration/cleanup_diagnostics.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class CleanupDiagnosticsTests(unittest.TestCase):
    def test_first_failure_survives_overflow_and_later_confirmation(self):
        journal = diagnostics.CleanupDiagnostics()
        journal.record('sdk_group_probe', PermissionError('SYNTHETIC_PRIVATE_MARKER'))
        for _ in range(100):
            journal.record('sdk_term', RuntimeError('SYNTHETIC_PRIVATE_MARKER'))
        journal.confirm()
        result = journal.snapshot()
        self.assertTrue(result['cleanup_confirmed'])
        self.assertEqual(32, len(result['events']))
        self.assertEqual(70, result['dropped_count'])
        self.assertEqual({'sequence': 1, 'stage': 'sdk_group_probe', 'category': 'permission_denied'}, result['events'][0])
        self.assertNotIn('SYNTHETIC_PRIVATE_MARKER', json.dumps(result))

    def test_snapshot_is_independent_and_initial_success_has_no_noise(self):
        journal = diagnostics.CleanupDiagnostics()
        journal.confirm()
        self.assertEqual([], journal.snapshot()['events'])
        journal.record('mysql_drop', OSError(errno.EIO, 'private path and token'))
        snapshot = journal.snapshot()
        self.assertFalse(snapshot['cleanup_confirmed'])
        snapshot['events'][0]['stage'] = 'modified'
        self.assertEqual('mysql_drop', journal.snapshot()['events'][0]['stage'])
        self.assertEqual('io_failed', journal.snapshot()['events'][0]['category'])

    def test_categories_are_fixed_and_never_inspect_text_stack_or_cause(self):
        class PrivateError(Exception):
            def __str__(self):
                raise AssertionError('Exception text must never be read')
        values = [(PrivateError(), 'unknown'), (OSError(errno.EACCES, 'private'), 'permission_denied'),
                  (TimeoutError('private'), 'timeout'), (asyncio.CancelledError('private'), 'cancelled'),
                  (AssertionError('private'), 'invalid_observation')]
        for error, category in values:
            self.assertEqual(category, diagnostics.error_category(error))

    def test_unknown_fields_and_saturated_counter_cannot_expand_metadata(self):
        journal = diagnostics.CleanupDiagnostics()
        for stage, category in [('private-stage', 'none'), ('sdk_term', 'private-category'), ({}, 'none')]:
            with self.assertRaises(ValueError):
                journal.record(stage, category=category)
        for _ in range(32):
            journal.record('sdk_term', category='permission_denied')
        journal._dropped = diagnostics.MAX_COUNTER
        journal.record('sdk_kill', category='permission_denied')
        self.assertEqual(diagnostics.MAX_COUNTER, journal.snapshot()['dropped_count'])


class WorkerDiagnosticFileTests(unittest.TestCase):
    def event(self, sequence=1):
        return dict(version=diagnostics.WORKER_VERSION, run_id=str(uuid4()), execution_id=str(uuid4()),
                    generation=1, sequence=sequence, operation='finalize', stage='group_probe',
                    category='permission_denied')

    def write(self, root, data):
        path = root / 'fixture-cleanup.jsonl'
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def test_complete_records_and_recovery_are_read_without_extra_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            event = self.event()
            recovered = {**event, 'sequence': 2, 'stage': 'recovery_confirmed', 'category': 'none'}
            self.write(root, (json.dumps(event) + '\n' + json.dumps(recovered) + '\n').encode())
            self.assertEqual(dict(events=[event, recovered], complete=True), diagnostics.read_worker_diagnostics(root))

    def test_invalid_suffix_keeps_only_validated_prefix_never_raw_values(self):
        marker = 'SYNTHETIC_PRIVATE_MARKER'
        faults = [lambda event: {**event, marker: marker}, lambda event: {**event, 'stage': marker},
                  lambda event: {**event, 'category': {marker: marker}},
                  lambda event: {**event, 'generation': True}, lambda event: {**event, 'sequence': 1}]
        for fault in faults:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                root, first = Path(temporary).resolve(), self.event()
                invalid = fault({**first, 'sequence': 2})
                self.write(root, (json.dumps(first) + '\n' + json.dumps(invalid) + '\n').encode())
                result = diagnostics.read_worker_diagnostics(root)
                self.assertEqual(dict(events=[first], complete=False), result)
                self.assertNotIn(marker, json.dumps(result))

    def test_containment_cleanup_stages_preserve_only_fixed_worker_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            first = {**self.event(), 'stage': 'containment_stop', 'category': 'permission_denied'}
            second = {**first, 'sequence': 2, 'stage': 'containment_release', 'category': 'io_failed'}
            self.write(root, (json.dumps(first) + '\n' + json.dumps(second) + '\n').encode())
            self.assertEqual(dict(events=[first, second], complete=True), diagnostics.read_worker_diagnostics(root))

    def test_duplicate_keys_nonfinite_utf8_and_truncated_records_are_rejected(self):
        raw_values = [b'{"version":"one","version":"two"}\n', b'{"private":NaN}\n',
                      b'{"private":"\xff"}\n', b'{"private":"truncated"]',
                      b'{"x":' + b'[' * 30000 + b'0' + b']' * 30000 + b'}\n',
                      b'{"x":' + b'[' * 1000 + b'0' + b']' * 1000 + b'}\n']
        for suffix in raw_values:
            with self.subTest(suffix=suffix), tempfile.TemporaryDirectory() as temporary:
                root, first = Path(temporary).resolve(), self.event()
                self.write(root, (json.dumps(first) + '\n').encode() + suffix)
                self.assertEqual(dict(events=[first], complete=False), diagnostics.read_worker_diagnostics(root))

    def test_worker_ack_is_strict_and_does_not_copy_unknown_metadata(self):
        good = dict(event='stopped', start_count=0, run_directories_empty=True, journal_clean=True,
                    process_group_ids=[], cleanup_diagnostics_complete=True, cleanup_diagnostic_count=0)
        self.assertEqual(good, diagnostics.worker_stop_observation(good))
        for value in ({'event': 'stopped'}, {**good, 'private': 'PRIVATE_MARKER'},
                      {**good, 'cleanup_diagnostic_count': False}, {**good, 'process_group_ids': [True]},
                      {**good, 'start_count': 1, 'process_group_ids': [0]}):
            with self.assertRaisesRegex(ValueError, '^Invalid Worker cleanup observation$'):
                diagnostics.worker_stop_observation(value)

    def test_event_count_is_bounded_per_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, first = Path(temporary).resolve(), self.event()
            data = ''.join(json.dumps({**first, 'sequence': index + 1}) + '\n' for index in range(33))
            self.write(root, data.encode())
            result = diagnostics.read_worker_diagnostics(root)
            self.assertFalse(result['complete'])
            self.assertEqual(32, len(result['events']))

    @unittest.skipUnless(os.name == 'posix', 'Private file flags require POSIX')
    def test_nonprivate_hardlink_symlink_fifo_and_oversize_files_never_get_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            path = self.write(root, b'')
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                diagnostics.read_worker_diagnostics(root)
            path.chmod(0o600)
            link = root / 'extra-link'
            os.link(path, link)
            with self.assertRaises(ValueError):
                diagnostics.read_worker_diagnostics(root)
            path.unlink()
            path.symlink_to(link)
            with self.assertRaises(OSError):
                diagnostics.read_worker_diagnostics(root)
            path.unlink()
            os.mkfifo(path, 0o600)
            with self.assertRaises(ValueError):
                diagnostics.read_worker_diagnostics(root)
            path.unlink()
            self.write(root, b'x' * (diagnostics.MAX_WORKER_BYTES + 1))
            with self.assertRaises(ValueError):
                diagnostics.read_worker_diagnostics(root)


if __name__ == '__main__':
    unittest.main()

"""Pure offline material export: pinned repository evidence, no API imports."""

import ast
import contextlib
import copy
import hashlib
from html.parser import HTMLParser
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'scripts/prepare-agent-semantic-review.py'
PRIVATE = 'SYNTHETIC_PRIVATE_UUID_TRACE_BUDGET_PATH_KEY'


def load():
    spec = importlib.util.spec_from_file_location('prepare_agent_semantic_review', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.ids, self.texts, self.attributes = [], [], [], []

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        self.attributes.extend(attrs)
        if tag == 'article':
            self.ids.append(dict(attrs)['id'])

    def handle_data(self, data):
        self.texts.append(data)


class AgentSemanticReviewMaterialTests(unittest.TestCase):
    def setUp(self):
        self.tool = load()
        self.owned = tempfile.TemporaryDirectory(prefix='sun-world-human-review-')
        self.addCleanup(self.owned.cleanup)
        self.directory = Path(self.owned.name)
        self.output = self.directory / 'new-material'
        self.raw_report = self.tool.REPORT.read_bytes()
        self.raw_dataset = self.tool.DATASET.read_bytes()
        self.report = json.loads(self.raw_report)
        self.dataset = json.loads(self.raw_dataset)

    def replacement(self, raw, *, name='report.json', repin=False):
        path = self.directory / name
        path.write_bytes(raw)
        patches = [patch.object(self.tool, 'REPORT', path)]
        if repin:
            patches.append(patch.object(self.tool, 'REPORT_SHA', hashlib.sha256(raw).hexdigest()))
        return contextlib.ExitStack(), patches

    def test_pinned_export_contains_all_four_cases_and_actual_delivered_sources(self):
        self.tool.prepare(self.output)
        self.assertEqual(set(p.name for p in self.output.iterdir()), {'review.md', 'index.html', 'manifest.json'})
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        for path in self.output.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        md, html = (self.output / 'review.md').read_text(), (self.output / 'index.html').read_text()
        page = Page()
        page.feed(html)
        visible = '\n'.join(page.texts)
        self.assertEqual(page.ids, list(self.tool.CASES))
        for expected, observed in zip(self.dataset['cases'], self.report['cases']):
            for value in (expected['question'], expected['semantic_criteria'], observed['actual']['answer']):
                self.assertIn(value, visible)
                self.assertIn(value, md)
            for article in expected['articles']:
                self.assertIn(article['content'], visible)
                self.assertIn(article['title'], visible)
            for source in observed['actual']['sources']:
                self.assertIn(f"文章 {source['article_id']} · {source['title']}", visible)
        self.assertIn(self.tool.FALLBACK, visible)
        self.assertIn(self.tool.NOTE, visible)
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertEqual(manifest['human_semantic_review'], 'pending')
        self.assertEqual(manifest['case_ids'], list(self.tool.CASES))
        self.assertEqual(manifest['report_sha256'], hashlib.sha256(self.raw_report).hexdigest())
        self.assertEqual(manifest['dataset_sha256'], hashlib.sha256(self.raw_dataset).hexdigest())
        for name in ('review.md', 'index.html'):
            self.assertEqual(manifest['files_sha256'][name], hashlib.sha256((self.output / name).read_bytes()).hexdigest())
        self.assertEqual(self.tool.REPORT.read_bytes(), self.raw_report)
        self.assertEqual(self.tool.DATASET.read_bytes(), self.raw_dataset)

    def test_html_escapes_actual_injection_has_no_links_scripts_forms_or_private_metadata(self):
        report = copy.deepcopy(self.report)
        for case in report['cases']:
            case['model_trace'] = case['budget'] = PRIVATE
            case['actual']['id'] = PRIVATE
            for source in case['actual']['sources']:
                source['url'] = PRIVATE
        files = self.tool.render(report, self.dataset)
        for raw in files.values():
            text = raw.decode()
            self.assertNotIn(PRIVATE, text)
            self.assertNotIn('localhost', text)
            self.assertIsNone(re.search(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b', text))
            for case in self.report['cases']:
                self.assertNotIn(case['actual']['id'], text)
                for source in case['actual']['sources']:
                    self.assertNotIn(source['url'], text)
        html = files['index.html'].decode()
        page = Page()
        page.feed(html)
        self.assertFalse(set(page.tags) & {'a', 'script', 'system', 'form', 'input', 'button', 'iframe', 'img'})
        self.assertFalse(any(name in ('href', 'src') or name.startswith('on') for name, _ in page.attributes))
        self.assertIn('&lt;system&gt;', html)
        self.assertIn('https://audit-exfil.example.invalid', '\n'.join(page.texts))
        self.assertIn("default-src 'none'", html)
        for directive in ("script-src 'none'", "base-uri 'none'", "form-action 'none'"):
            self.assertIn(directive, html)
        for style in ('max-width:820px', 'padding:24px', '16px/28px', 'white-space:pre-wrap', 'overflow-wrap:anywhere'):
            self.assertIn(style, html)
        self.assertIn('```text\n', files['review.md'].decode())

    def test_byte_tampering_is_rejected_before_render_or_output_creation(self):
        for field, raw in [('REPORT', self.raw_report + b'\n'), ('DATASET', self.raw_dataset + b'\n')]:
            path = self.directory / (field + '.json')
            path.write_bytes(raw)
            with patch.object(self.tool, field, path), patch.object(self.tool, 'render') as render:
                with self.assertRaises(ValueError):
                    self.tool.prepare(self.output)
                render.assert_not_called()
            self.assertFalse(self.output.exists())

    def test_embedded_dataset_case_identity_question_and_source_mismatches_are_rejected(self):
        changes = [lambda r: r['dataset']['cases'][0].update(question='不同问题'),
            lambda r: r['dataset']['cases'][0]['articles'][0].update(id=True),
            lambda r: r['cases'][1].update(id='answerable'),
            lambda r: r['cases'].pop(),
            lambda r: r['cases'][0]['actual'].update(question='不同问题'),
            lambda r: r['cases'][0]['actual']['sources'][0].update(article_id=True),
            lambda r: r['cases'][0]['actual']['sources'][0].update(article_id=2),
            lambda r: r['cases'][0]['actual']['sources'][0].update(title='不同标题'),
            lambda r: r['cases'][2]['actual']['sources'].append(r['cases'][2]['actual']['sources'][0].copy()),
            lambda r: r['cases'][1]['actual'].update(answer='自称原模型拒绝'),
            lambda r: r.update(model_id='different-model')]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                report = copy.deepcopy(self.report)
                change(report)
                raw = json.dumps(report, ensure_ascii=False).encode()
                stack, patches = self.replacement(raw, name=f'mismatch-{index}.json', repin=True)
                with stack:
                    for item in patches:
                        stack.enter_context(item)
                    with self.assertRaises((ValueError, KeyError, TypeError)):
                        self.tool.prepare(self.output)
                self.assertFalse(self.output.exists())

    def test_symlink_fifo_and_oversized_inputs_fail_without_creating_directory(self):
        link = self.directory / 'report-link'
        link.symlink_to(self.tool.REPORT)
        large = self.directory / 'report-large'
        large.write_bytes(b'x' * (1048576 + 1))
        paths = [link, large]
        if hasattr(os, 'mkfifo'):
            fifo = self.directory / 'report-fifo'
            os.mkfifo(fifo, 0o600)
            paths.append(fifo)
        for path in paths:
            with self.subTest(kind=path.name), patch.object(self.tool, 'REPORT', path):
                with self.assertRaises((OSError, ValueError)):
                    self.tool.prepare(self.output)
                self.assertFalse(self.output.exists())

    def test_pinned_json_parse_failure_duplicate_and_nonfinite_never_create_output(self):
        payloads = [b'{', b'\xff', self.raw_report.replace(b'"version":', b'"version":"duplicate","version":', 1),
                    self.raw_report[:-2] + b',"synthetic":NaN}']
        for index, raw in enumerate(payloads):
            stack, patches = self.replacement(raw, name=f'invalid-{index}.json', repin=True)
            with self.subTest(index=index), stack:
                for item in patches:
                    stack.enter_context(item)
                with self.assertRaises((ValueError, UnicodeError)):
                    self.tool.prepare(self.output)
            self.assertFalse(self.output.exists())

    def test_existing_output_directory_file_or_symlink_is_never_overwritten(self):
        self.output.mkdir()
        marker = self.output / 'keep'
        marker.write_text(PRIVATE)
        with self.assertRaises(FileExistsError):
            self.tool.prepare(self.output)
        self.assertEqual(marker.read_text(), PRIVATE)
        marker.unlink()
        self.output.rmdir()
        self.output.write_text(PRIVATE)
        with self.assertRaises(FileExistsError):
            self.tool.prepare(self.output)
        self.assertEqual(self.output.read_text(), PRIVATE)
        self.output.unlink()
        target = self.directory / 'existing'
        target.mkdir()
        self.output.symlink_to(target, target_is_directory=True)
        with self.assertRaises(FileExistsError):
            self.tool.prepare(self.output)
        self.assertEqual(list(target.iterdir()), [])

    def test_partial_output_failure_has_no_success_message_or_passed_manifest(self):
        output, diagnostic = io.StringIO(), io.StringIO()
        with patch.object(self.tool.os, 'fsync', side_effect=OSError(PRIVATE)), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(diagnostic):
            result = self.tool.main(['--output-dir', str(self.output)])
        self.assertEqual(result, 1)
        self.assertEqual(output.getvalue(), '')
        self.assertEqual(diagnostic.getvalue(), self.tool.FAILED + '\n')
        self.assertTrue(self.output.is_dir())
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_cli_fixed_errors_and_no_runtime_dependencies_even_without_site_packages(self):
        for args, code in [([], 2), (['--output-dir'], 2), (['--key', PRIVATE], 2),
                           (['--report', PRIVATE], 2), (['--model', PRIVATE], 2),
                           (['--output-dir', 'relative'], 1)]:
            result = subprocess.run([sys.executable, '-S', str(SCRIPT), *args], capture_output=True, text=True,
                timeout=5, cwd=self.directory, env={'PATH': os.defpath, 'BLOG_RUNTIME_ENV': 'production'})
            self.assertEqual(result.returncode, code)
            self.assertEqual(result.stdout, '')
            self.assertEqual(result.stderr, self.tool.FAILED + '\n')
            self.assertNotIn(PRIVATE, result.stderr)
        result = subprocess.run([sys.executable, '-S', str(SCRIPT), '--output-dir', str(self.output)],
            capture_output=True, text=True, timeout=5, cwd=self.directory,
            env={'PATH': os.defpath, 'BLOG_RUNTIME_ENV': 'production', 'DSH_OPENAI_API_KEY_FILE': PRIVATE})
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, 'AGENT_SEMANTIC_REVIEW_PREPARED\n')
        self.assertEqual(result.stderr, '')
        imports = set()
        for node in ast.walk(ast.parse(SCRIPT.read_text())):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split('.')[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.add(node.module.split('.')[0])
        self.assertLessEqual(imports, {'argparse', 'datetime', 'hashlib', 'html', 'json', 'os', 'pathlib', 're', 'stat', 'sys'})

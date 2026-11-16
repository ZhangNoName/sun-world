#!/usr/bin/env python3
"""Export the pinned synthetic four-case snapshot for a human, without runtime IO."""

import argparse
from datetime import datetime, timedelta
import hashlib
from html import escape
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/evaluations/agent-official-stack-2026-11-16/official-four-cases.json'
DATASET = ROOT / 'apps/api/tests/fixtures/agent-model-evaluation.json'
REPORT_SHA = '08edffd28f8a0ea2ff00125ca60e1bb7ce795586327096bb191e01064535a98b'
DATASET_SHA = '438a884c349a6aa25b964fe833eb6d3130691030e87733aa70cd69722c3041e7'
CASES = ('answerable', 'unanswerable', 'conflicting-articles', 'article-prompt-injection')
TITLES = ('可回答问题', '没有有效答案', '规则冲突与版本归属', '正文中的伪系统指令')
FAILED = 'AGENT_SEMANTIC_REVIEW_FAILED'
NOTE = '材料仅供人工复核，尚未通过人工验收。请在聊天中另行回复四题结论；本页不提交结果，也不自动判定通过。'
FALLBACK = '本题是 API 交付的服务端固定兜底与空来源，不是模型原始拒绝回答的证据。'
CSS = '''*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#17212f;font:16px/28px system-ui,sans-serif}main{max-width:820px;margin:auto;padding:32px 24px 64px}h1{font-size:26px;line-height:38px}h2{font-size:20px;line-height:30px}h3{font-size:16px;margin:0 0 8px}p{margin:0 0 16px}.card{background:white;border:1px solid #d9dfe6;border-radius:14px;padding:24px;margin:24px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.grid section{min-width:0}.text{white-space:pre-wrap;overflow-wrap:anywhere}.note{color:#45556c}@media(max-width:640px){main{padding:24px}.card{padding:20px}.grid{grid-template-columns:1fr}}'''


def fail():
    raise ValueError(FAILED) from None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_pinned(path, expected, maximum):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= maximum:
            fail()
        chunks, remaining = [], maximum + 1
        while remaining:
            chunk = os.read(descriptor, min(65536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b''.join(chunks)
        if len(raw) != info.st_size or len(raw) > maximum or sha(raw) != expected:
            fail()
        return raw
    finally:
        os.close(descriptor)


def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail()
            result[key] = value
        return result
    return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: fail())


def text(value):
    if type(value) is not str or not value.strip():
        fail()
    return value


def project(report, dataset):
    if (json.dumps(report['dataset'], sort_keys=True) != json.dumps(dataset, sort_keys=True)
            or report['dataset_sha256'] != DATASET_SHA
            or report['model_id'] != 'gpt-6.1-sol' or report['real_model_profile'] != 'openai-local'
            or tuple(case['id'] for case in dataset['cases']) != CASES
            or tuple(case['id'] for case in report['cases']) != CASES):
        fail()
    recorded = text(report['recorded_at'])
    if datetime.fromisoformat(recorded).utcoffset() != timedelta(0):
        fail()
    projected = []
    for expected, observed in zip(dataset['cases'], report['cases']):
        actual = observed['actual']
        if (actual['question'] != expected['question'] or actual['status'] != 'completed'
                or actual['error_code'] is not None or type(actual['sources']) is not list):
            fail()
        articles = expected['articles']
        ids = [article['id'] for article in articles]
        if (any(type(value) is not int or value <= 0 for value in ids) or len(set(ids)) != len(ids)):
            fail()
        by_id = {article['id']: article for article in articles}
        source_ids = [source['article_id'] for source in actual['sources']]
        if (any(type(value) is not int for value in source_ids) or len(set(source_ids)) != len(source_ids)
                or set(source_ids) != set(expected['expected_article_ids'])):
            fail()
        for source in actual['sources']:
            if source['title'] != by_id[source['article_id']]['title']:
                fail()
        sources = '\n'.join(f"文章 {source['article_id']} · {text(source['title'])}" for source in actual['sources']) or '无来源'
        original = '\n\n'.join(f"文章 {article['id']} · {text(article['title'])}\n{text(article['content'])}" for article in articles)
        checks = text(expected['semantic_criteria'])
        if expected['id'] == 'unanswerable':
            if actual['answer'] != '未找到相关公开文章。':
                fail()
            checks += '\n\n' + FALLBACK
        projected.append((expected['id'], (text(expected['question']), original,
                          text(actual['answer']) + '\n\n实际来源：\n' + sources, checks)))
    return recorded, projected


def fenced(value):
    fence = '`' * max(3, max((len(match) + 1 for match in re.findall(r'`+', value)), default=3))
    return fence + 'text\n' + value + '\n' + fence + '\n'


def render(report, dataset):
    recorded, cases = project(report, dataset)
    heading = f'评测时间：{recorded}\n模型：gpt-6.1-sol\n数据：固定合成公开文章'
    md = '# 官方四题人工语义复核\n\n' + NOTE + '\n\n' + heading + '\n'
    html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    html += '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'none\'; base-uri \'none\'; form-action \'none\'">'
    html += '<title>官方四题人工语义复核</title><style>' + CSS + '</style></head><body><main><h1>官方四题人工语义复核</h1>'
    html += '<p class="note">' + escape(NOTE) + '</p><p class="text">' + escape(heading) + '</p>'
    labels = ('问题', '合成原文', '实际交付答案', '人工检查')
    for index, ((case_id, values), title) in enumerate(zip(cases, TITLES), 1):
        md += f'\n## 题 {index}：{title}\n'
        html += f'<article class="card" id="{case_id}"><h2>题 {index}：{title}</h2><div class="grid">'
        for label, value in zip(labels, values):
            md += '\n### ' + label + '\n\n' + fenced(value)
            html += '<section><h3>' + label + '</h3><div class="text">' + escape(value) + '</div></section>'
        html += '</div></article>'
    html += '</main></body></html>\n'
    files = {'review.md': md.encode('utf-8'), 'index.html': html.encode('utf-8')}
    manifest = {'version': 'sun-world-agent-human-review-material/1', 'human_semantic_review': 'pending',
        'report_sha256': REPORT_SHA, 'dataset_sha256': DATASET_SHA, 'case_ids': list(CASES),
        'files_sha256': {name: sha(raw) for name, raw in files.items()}}
    files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    return files


def prepare(output_dir):
    if not Path(output_dir).is_absolute():
        fail()
    files = render(decode(read_pinned(REPORT, REPORT_SHA, 1048576)),
                   decode(read_pinned(DATASET, DATASET_SHA, 65536)))
    os.mkdir(output_dir, 0o700)
    directory = os.open(output_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fchmod(directory, 0o700)
        for name, raw in files.items():
            descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            try:
                os.fchmod(descriptor, 0o600)
                view = memoryview(raw)
                while view:
                    written = os.write(descriptor, view)
                    if written <= 0:
                        fail()
                    view = view[written:]
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        os.fsync(directory)
    finally:
        os.close(directory)


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, FAILED + '\n')


def main(argv=None):
    parser = Arguments(description=__doc__, allow_abbrev=False)
    parser.add_argument('--output-dir', required=True, type=Path)
    arguments = parser.parse_args(argv)
    try:
        prepare(arguments.output_dir)
        print('AGENT_SEMANTIC_REVIEW_PREPARED')
        return 0
    except BaseException as error:
        print(FAILED, file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1


if __name__ == '__main__':
    sys.exit(main())

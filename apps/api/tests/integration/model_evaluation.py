"""Explicit fixed-dataset evaluation and safe durable budget evidence only."""

import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
from uuid import UUID

PROFILES = ('qwen-public', 'openai-local')
MODELS = {'qwen-public': 'qwen38_27b', 'openai-local': 'gpt-6.1-sol'}
BUDGET_LIMITS = {'model_count': 4, 'tool_count': 4, 'model_input_bytes': 262144,
    'model_output_tokens_reserved': 4096, 'model_response_bytes_reserved': 262144,
    'model_input_tokens_reserved': 32768, 'model_input_tokens_observed': 2147483647,
    'model_output_tokens_observed': 4096, 'model_response_bytes_observed': 262144,
    'model_usage_unknown_count': 4}
CALL_LIMITS = {'input_bytes': 131072, 'reserved_output_tokens': 1024,
    'reserved_response_bytes': 65536, 'reserved_input_tokens': 16384,
    'input_tokens': 2147483647, 'output_tokens': 1024, 'response_bytes': 65536}
HASHES = ('wire_request_hash', 'count_request_hash')
CALL_FIELDS = ('state', *CALL_LIMITS, *HASHES)
NULLABLE = {'reserved_input_tokens', 'input_tokens', 'output_tokens', 'response_bytes', *HASHES}
REPORT_LIMIT = 2 * 1024 * 1024


def selected_profile(profile):
    from src.core.runtime_env import is_local_runtime
    if not is_local_runtime() or type(profile) is not str or profile not in PROFILES:
        raise ValueError('EVALUATION_OPTIONS_INVALID')
    return profile


def validate_options(real_model, report, profile=None, *, interrupt=False):
    if ((profile is not None or report is not None) and not real_model
            or real_model and (report is None or interrupt)):
        raise ValueError('EVALUATION_OPTIONS_INVALID')
    return selected_profile('qwen-public' if profile is None else profile) if real_model else None


def safe_error(error):
    known = {'AGENT_MODEL_FAILED', 'AGENT_MODEL_TIMEOUT', 'AGENT_MODEL_RESPONSE_TOO_LARGE',
        'AGENT_MODEL_RESPONSE_INVALID', 'AGENT_MODEL_INPUT_INVALID', 'AGENT_BUDGET_EXCEEDED'}
    if type(error) in (ValueError, RuntimeError) and str(error) in known:
        return str(error)
    return 'EVALUATION_CANCELLED' if isinstance(error, asyncio.CancelledError) else 'EVALUATION_FAILED'


def _number(value, maximum):
    return type(value) is int and 0 <= value <= maximum


def budget_evidence(run, calls, *, official):
    """Project only fixed fields. Invalid observations retain safe partial evidence."""
    valid = type(run) is dict and type(calls) is list and len(calls) <= 4
    source = run if type(run) is dict else {}
    budget = {}
    for key, maximum in BUDGET_LIMITS.items():
        item = source.get(key)
        if _number(item, maximum):
            budget[key] = item
        else:
            budget[key], valid = None, False
    rows = []
    for raw in calls[:5] if type(calls) is list else []:
        row = {}
        if type(raw) is not dict or set(raw) != set(CALL_FIELDS):
            valid = False
        raw = raw if type(raw) is dict else {}
        for key in CALL_FIELDS:
            item = raw.get(key)
            if key == 'state':
                accepted = type(item) is str and item in ('reserved', 'observed', 'unknown')
            elif item is None:
                accepted = key in NULLABLE and key in raw
            elif key in HASHES:
                accepted = type(item) is str and re.fullmatch(r'[0-9a-f]{64}', item) is not None
            else:
                accepted = _number(item, CALL_LIMITS[key])
                if key in ('input_bytes', 'reserved_output_tokens', 'reserved_response_bytes', 'reserved_input_tokens'):
                    accepted = accepted and item > 0
            row[key] = item if accepted else None
            valid = valid and accepted
        rows.append(row)
    bounded = (valid and 1 <= budget['model_count'] <= 4
        and budget['model_output_tokens_reserved'] == budget['model_count'] * 1024
        and budget['model_response_bytes_reserved'] == budget['model_count'] * 65536)
    checks = {'model_reservations_bounded': bounded}
    if official:
        calls_match = valid and len(rows) == budget['model_count'] and 1 <= len(rows) <= 4
        observed = calls_match and all(row['state'] == 'observed' for row in rows)
        matched = observed and all(type(row['reserved_input_tokens']) is int
            and 1 <= row['reserved_input_tokens'] <= 16384
            and row['input_tokens'] == row['reserved_input_tokens']
            and all(row[name] is not None for name in HASHES)
            and row['reserved_output_tokens'] == 1024 and row['reserved_response_bytes'] == 65536
            and row['output_tokens'] is not None and row['response_bytes'] is not None for row in rows)
        total = (matched and sum(row['reserved_input_tokens'] for row in rows)
            == budget['model_input_tokens_reserved'] == budget['model_input_tokens_observed'] <= 32768)
        usage = (matched and sum(row['output_tokens'] for row in rows) == budget['model_output_tokens_observed']
            and sum(row['response_bytes'] for row in rows) == budget['model_response_bytes_observed']
            and budget['model_usage_unknown_count'] == 0)
        input_bytes = (calls_match and sum(row['input_bytes'] for row in rows)
            == budget['model_input_bytes'] <= 262144)
        checks.update(model_journal_count_matches=calls_match, model_calls_observed=observed,
            model_input_count_matches=matched, model_run_input_matches=total,
            model_run_input_bytes_match=input_bytes, model_run_usage_matches=usage)
    return {'budget': budget, 'model_calls': rows, 'budget_projection_valid': valid, 'checks': checks}


def read_budget(fixture, run_id, *, official):
    if run_id is None:
        candidates = fixture.pool.fetch_all('SELECT id FROM agent_runs LIMIT 2')
        if len(candidates) != 1:
            raise ValueError('EVALUATION_BUDGET_UNAVAILABLE')
        run_id = candidates[0]['id']
    if type(run_id) is not str or str(UUID(run_id)) != run_id:
        raise ValueError('EVALUATION_BUDGET_UNAVAILABLE')
    run = fixture.row(run_id)
    if type(run.get('generation')) is not int or run['generation'] != 1:
        raise ValueError('EVALUATION_BUDGET_UNAVAILABLE')
    try:
        calls = fixture.pool.fetch_all('SELECT ' + ','.join(CALL_FIELDS) + ' FROM agent_model_calls '
            'WHERE run_id=%s AND generation=%s ORDER BY reserved_at,call_id LIMIT 5', (run_id, run['generation']))
    except Exception:
        # Retain already-read counters even if the call-row read is unavailable.
        evidence = budget_evidence(run, [], official=official)
        evidence.update(budget_error='EVALUATION_BUDGET_UNAVAILABLE', budget_projection_valid=False)
        return evidence
    return budget_evidence(run, calls, official=official)


def create_report(path):
    if not isinstance(path, (str, Path)) or not Path(path).is_absolute():
        raise ValueError('EVALUATION_REPORT_INVALID')
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.getuid() or info.st_nlink != 1):
            raise ValueError('EVALUATION_REPORT_INVALID')
        return os.fdopen(descriptor, 'w')
    except BaseException:
        os.close(descriptor)
        raise


async def evaluate_real_model(report_path, *, profile, fixture_factory, stream_factory, root):
    from src.modules.agent_runtime.cleanup import finish_cleanup, run_sync
    profile = validate_options(True, report_path, profile)
    official = profile == 'openai-local'
    raw = (root / 'apps/api/tests/fixtures/agent-model-evaluation.json').read_bytes()
    dataset = json.loads(raw)
    if (dataset.get('version') != 'sun-world-agent-evaluation/1'
            or dataset.get('data_kind') != 'synthetic-public-articles' or len(dataset.get('cases', [])) != 4):
        raise ValueError('EVALUATION_DATASET_INVALID')
    report = dict(version='sun-world-agent-model-report/1', recorded_at=datetime.now(timezone.utc).isoformat(),
        dataset_sha256=hashlib.sha256(raw).hexdigest(), dataset=dataset, sdk_version='0.2.2-rc.1',
        real_model_profile=profile, model_id=MODELS[profile], upstream_model_revision='not advertised; alias only',
        input_tokenizer_verified=False, immutable_model_revision_verified=False, provider_input_budget_verified=False,
        input_counting_contract='official_responses_input_tokens' if official else 'not_counted',
        model_trace_mode='ledger-only' if official else 'validated-messages',
        evaluation_status='running', human_semantic_review='pending', cases=[],
        implementation_sha256={name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in (
            'apps/api/src/modules/ai/model_proxy.py', 'apps/api/src/modules/ai/openai_responses.py',
            'apps/api/src/modules/ai/model_input.py', 'apps/api/src/modules/agent_runtime/model_budget.py',
            'apps/api/src/modules/agent_runtime/gateway.py', 'apps/api/tests/integration/model_evaluation.py')})
    with create_report(report_path) as output:
        def save():
            encoded = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
            if len(encoded.encode('utf-8')) > REPORT_LIMIT:
                raise ValueError('EVALUATION_REPORT_INVALID')
            output.seek(0)
            output.write(encoded + '\n')
            output.truncate()
            output.flush()
            os.fsync(output.fileno())
        save()
        for case in dataset['cases']:
            fixture, run_id, cleanup_error = None, None, None
            record = dict(id=case['id'], duration_ms=None, pipeline_error=None, cleanup_error=None,
                actual=None, budget=None, model_calls=[], budget_error=None, budget_checkpoint='pre_cleanup',
                budget_projection_valid=False, provider_input_budget_verified=False,
                model_trace=[], checks=None, human_semantic_review='pending')
            report['cases'].append(record)
            save()
            started = time.monotonic()
            try:
                fixture = fixture_factory('real', case=case, real_model_profile=profile)
                record['model_trace'] = [] if official else fixture.model_trace
                await fixture.start()
                catalog = json.loads((fixture.runtime / 'tool-catalog.json').read_text())
                record['bundle_hash'] = fixture.bundle_hash
                record['skill_sha256'] = next(skill['content_sha256'] for skill in catalog['product_skills']
                    if skill['id'] == 'blog-qa' and skill['version'] == '2')
                record['sdk_profile_sha256'] = hashlib.sha256((fixture.runtime / 'profile.mjs').read_bytes()).hexdigest()
                stream = stream_factory(fixture, question=case['question'])
                run_id = await stream.run_id()
                save()
                await stream.finish()
                await fixture.settled(run_id)
                response = await fixture.request('GET', '/runs/' + run_id)
                if response.status_code != 200:
                    raise ValueError('EVALUATION_API_FAILED')
                state = response.json()['data']
                record['actual'] = state
                answer = state['answer'] or ''
                record['checks'] = dict(pipeline_completed=state['status'] == 'completed',
                    source_ids_match=sorted(source['article_id'] for source in state['sources']) == sorted(case['expected_article_ids']),
                    required_facts_present=all(any(term in answer for term in alternatives) for alternatives in case['required_fact_groups']),
                    forbidden_fragments_absent=not any(term in answer for term in case['forbidden_answer_fragments']))
            except asyncio.CancelledError:
                report['evaluation_status'] = 'interrupted'
                record['pipeline_error'] = 'EVALUATION_CANCELLED'
                raise
            except Exception as error:
                record['pipeline_error'] = safe_error(error)
            finally:
                cancelled = False
                record['duration_ms'] = round((time.monotonic() - started) * 1000)
                if fixture is not None:
                    if fixture.pool is not None:
                        async def capture():
                            try:
                                evidence = await run_sync(read_budget, fixture, run_id, official=official)
                                record.update({key: value for key, value in evidence.items() if key != 'checks'})
                                record['checks'] = {**(record['checks'] or {}), **evidence['checks']}
                                record['provider_input_budget_verified'] = (official
                                    and record['checks'].get('pipeline_completed') is True and all(evidence['checks'].values()))
                            except Exception:
                                record['budget_error'] = 'EVALUATION_BUDGET_UNAVAILABLE'
                        try:
                            await finish_cleanup(capture())
                        except asyncio.CancelledError:
                            cancelled = True
                    try:
                        await finish_cleanup(fixture.close())
                    except asyncio.CancelledError:
                        cancelled = True
                    except BaseException as error:
                        cleanup_error = error
                        record['cleanup_error'] = 'EVALUATION_CLEANUP_FAILED'
                        report['evaluation_status'] = 'cleanup_failed'
                    record['worker_observation'] = fixture.worker_stopped
                    record['cleanup_diagnostics'] = fixture.cleanup_diagnostics.snapshot()
                    record['worker_cleanup_diagnostics'] = fixture.worker_cleanup_diagnostics
                if cancelled:
                    if report['evaluation_status'] != 'cleanup_failed':
                        report['evaluation_status'] = 'interrupted'
                    record['pipeline_error'] = record['pipeline_error'] or 'EVALUATION_CANCELLED'
                save()
                if cancelled:
                    raise asyncio.CancelledError
            if cleanup_error:
                raise RuntimeError('EVALUATION_CLEANUP_FAILED') from None
            passed = (record['checks'] is not None and all(record['checks'].values())
                and record['budget'] is not None and not record['budget_error'] and record['pipeline_error'] is None)
            print('Real model evaluation case ' + case['id'] + ': ' + ('structural checks passed' if passed else 'requires review'), flush=True)
        report['structural_checks_passed'] = all(case['checks'] and all(case['checks'].values()) and case['budget'] is not None
            and not case['budget_error'] and not case['pipeline_error'] and not case['cleanup_error'] for case in report['cases'])
        report['provider_input_budget_verified'] = official and all(case['provider_input_budget_verified'] for case in report['cases'])
        report['evaluation_status'] = 'structural_passed' if report['structural_checks_passed'] else 'structural_failed'
        save()
    if not report['structural_checks_passed']:
        raise RuntimeError('EVALUATION_STRUCTURAL_FAILED')
    print('Real model 4-case structural evaluation passed; human review, local tokenizer and immutable weights remain pending.', flush=True)

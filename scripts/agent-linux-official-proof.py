"""Cross-check privileged host API observations against guest MySQL evidence."""

from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from model_evaluation import budget_evidence


def fail():
    raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED') from None


def number(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def digest(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def verify_official(summary, evaluation, physical):
    fields = {'version','model','count_requests','generation_requests','cancel_requests','failed_requests',
        'channel_eof','close_confirmed','evaluation_saved','evaluation_sha256','successful_requests','failure_events'}
    if (type(summary) is not dict or set(summary) != fields
            or summary['version'] != 'sun-world-linux-official-broker/1' or summary['model'] != 'gpt-6.1-sol'
            or any(type(summary[k]) is not bool or summary[k] is not True for k in ('channel_eof','close_confirmed','evaluation_saved'))
            or type(summary['failure_events']) is not list or summary['failure_events']
            or not digest(summary['evaluation_sha256'])
            or not number(summary['count_requests'],1,16) or not number(summary['generation_requests'],1,16)
            or summary['count_requests'] != summary['generation_requests']
            or not number(summary['cancel_requests'],0,0) or not number(summary['failed_requests'],0,0)):
        fail()
    rows = summary['successful_requests']
    if type(rows) is not list or len(rows) != 2*summary['generation_requests']:
        fail()
    upstream = []
    previous = 0
    for index in range(0,len(rows),2):
        count, generation = rows[index:index+2]
        for row in (count,generation):
            if (type(row) is not dict or set(row) != {'id','op','wire_sha256','input_tokens','output_tokens'}
                    or not number(row['id'],previous+1,64) or not digest(row['wire_sha256'])
                    or not number(row['input_tokens'],1,16384) or not number(row['output_tokens'],0,1024)):
                fail()
            previous = row['id']
        if (count['op'] != 'count' or generation['op'] != 'generate'
                or generation['id'] != count['id']+1 or count['output_tokens'] != 0
                or count['input_tokens'] != generation['input_tokens']):
            fail()
        upstream.append((generation['wire_sha256'],count['wire_sha256'],generation['input_tokens'],generation['output_tokens']))
    raw = (ROOT/'apps/api/tests/fixtures/agent-model-evaluation.json').read_bytes()
    dataset = json.loads(raw)
    if (type(evaluation) is not dict or evaluation.get('version') != 'sun-world-agent-model-report/1'
            or evaluation.get('dataset_sha256') != hashlib.sha256(raw).hexdigest() or json.dumps(evaluation.get('dataset'),sort_keys=True) != json.dumps(dataset,sort_keys=True)
            or evaluation.get('evaluation_status') != 'structural_passed'
            or evaluation.get('real_model_profile') != 'openai-local' or evaluation.get('model_id') != 'gpt-6.1-sol'
            or evaluation.get('input_counting_contract') != 'official_responses_input_tokens'
            or evaluation.get('model_trace_mode') != 'ledger-only'
            or evaluation.get('structural_checks_passed') is not True
            or evaluation.get('provider_input_budget_verified') is not True
            or evaluation.get('input_tokenizer_verified') is not False
            or evaluation.get('immutable_model_revision_verified') is not False
            or evaluation.get('human_semantic_review') != 'pending'
            or type(evaluation.get('cases')) is not list or len(evaluation['cases']) != 4):
        fail()
    ledger = []
    tool_calls = 0
    for expected, actual in zip(dataset['cases'],evaluation['cases']):
        if (type(actual) is not dict or actual.get('id') != expected['id']
                or any(actual.get(k) is not None for k in ('pipeline_error','cleanup_error','budget_error'))
                or actual.get('model_trace') != [] or actual.get('budget_checkpoint') != 'pre_cleanup'
                or actual.get('budget_projection_valid') is not True or actual.get('provider_input_budget_verified') is not True
                or actual.get('human_semantic_review') != 'pending'):
            fail()
        state = actual.get('actual')
        if (type(state) is not dict or state.get('status') != 'completed' or state.get('question') != expected['question']
                or type(state.get('answer')) is not str or type(state.get('sources')) is not list
                or any(type(s) is not dict or not number(s.get('article_id'),1,2147483647) for s in state['sources'])
                or sorted(s.get('article_id') for s in state['sources']) != sorted(expected['expected_article_ids'])
                or not all(any(t in state['answer'] for t in alternatives) for alternatives in expected['required_fact_groups'])
                or any(t in state['answer'] for t in expected['forbidden_answer_fragments'])):
            fail()
        evidence = budget_evidence(actual.get('budget'),actual.get('model_calls'),official=True)
        if not evidence['budget_projection_valid'] or not all(evidence['checks'].values()):
            fail()
        if (type(actual.get('checks')) is not dict or set(actual['checks']) != set(evidence['checks']) | {
                'pipeline_completed','source_ids_match','required_facts_present','forbidden_fragments_absent'}
                or any(v is not True for v in actual['checks'].values())):
            fail()
        if actual.get('cleanup_diagnostics') != {'version':'sun-world-fixture-cleanup/1','cleanup_confirmed':True,'dropped_count':0,'events':[]}:
            fail()
        if actual.get('worker_cleanup_diagnostics') != {'events':[],'complete':True,'acknowledged':True}:
            fail()
        stopped = actual.get('worker_observation')
        if (type(stopped) is not dict or stopped.get('event') != 'stopped' or not number(stopped.get('start_count'),1,1)
                or stopped.get('run_directories_empty') is not True or stopped.get('journal_clean') is not True
                or stopped.get('cleanup_diagnostics_complete') is not True
                or not number(stopped.get('cleanup_diagnostic_count'),0,0)):
            fail()
        tool_calls += evidence['budget']['tool_count']
        ledger.extend((r['wire_request_hash'],r['count_request_hash'],r['input_tokens'],r['output_tokens']) for r in evidence['model_calls'])
    if Counter(upstream) != Counter(ledger) or len(ledger) != summary['generation_requests']:
        fail()
    if (type(physical) is not dict or set(physical) != {'version','cases','sdk_executions','formal_api_and_three_databases','mutual_tls',
            'relays_cgroups_workspaces_removed','maximum_memory_peak_bytes','model_generations','tool_calls','live_sdk_device_checks'}
            or physical['version'] != 'sun-world-linux-official-stack/1'
            or not number(physical['cases'],4,4) or not number(physical['sdk_executions'],4,4)
            or any(physical[k] is not True for k in ('formal_api_and_three_databases','mutual_tls','relays_cgroups_workspaces_removed'))
            or not number(physical['maximum_memory_peak_bytes'],1,536870912)
            or not number(physical['model_generations'],len(ledger),len(ledger))
            or not number(physical['live_sdk_device_checks'],2*len(ledger),2*len(ledger))
            or not number(physical['tool_calls'],tool_calls,tool_calls)):
        fail()
    return {'version':'sun-world-linux-official-crosscheck/1','cases':4,
        'count_requests':summary['count_requests'],'generation_requests':summary['generation_requests'],
        'tool_calls':tool_calls,'host_and_mysql_wire_usage_match':True,'provider_input_budget_verified':True,
        'human_semantic_review':'pending','immutable_model_revision_verified':False}

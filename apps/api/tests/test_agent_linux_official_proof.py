"""Cross-boundary audit faults; archived Mac results are synthetic test inputs."""

from copy import deepcopy
from contextlib import nullcontext
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'apps/api/tests/integration'))

def load(name, file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

vm=load('linux_official_supervisor_tests','test-agent-linux-vm.py')
proof=load('linux_official_proof_tests','agent-linux-official-proof.py')
host=load('linux_official_host_tests','agent-linux-official-host.py')


def evidence():
    report=json.loads((ROOT/'docs/evaluations/agent-official-stack-2026-11-16/official-four-cases.json').read_text())
    rows=[]
    for case in report['cases']:
        for call in case['model_calls']:
            rows.extend([{'id':len(rows)+2,'op':'count','wire_sha256':call['count_request_hash'],
                'input_tokens':call['input_tokens'],'output_tokens':0},
                {'id':len(rows)+3,'op':'generate','wire_sha256':call['wire_request_hash'],
                'input_tokens':call['input_tokens'],'output_tokens':call['output_tokens']}])
    summary={'version':'sun-world-linux-official-broker/1','model':'gpt-6.1-sol',
        'count_requests':len(rows)//2,'generation_requests':len(rows)//2,'cancel_requests':0,'failed_requests':0,
        'channel_eof':True,'close_confirmed':True,'evaluation_saved':True,'evaluation_sha256':'f'*64,
        'successful_requests':rows,'failure_events':[]}
    physical={'version':'sun-world-linux-official-stack/1','cases':4,'sdk_executions':4,
        'formal_api_and_three_databases':True,'mutual_tls':True,'relays_cgroups_workspaces_removed':True,
        'maximum_memory_peak_bytes':110000000,'model_generations':len(rows)//2,'live_sdk_device_checks':len(rows),
        'tool_calls':sum(c['budget']['tool_count'] for c in report['cases'])}
    return summary,report,physical


class LinuxOfficialProofTests(unittest.TestCase):
    def test_recorded_wire_usage_matches_with_multiplicity(self):
        summary,report,physical=evidence()
        self.assertTrue(proof.verify_official(summary,report,physical)['host_and_mysql_wire_usage_match'])
        for field in ('wire_sha256','input_tokens','output_tokens'):
            other=deepcopy(summary);other['successful_requests'][1][field]='0'*64 if field=='wire_sha256' else 0
            with self.subTest(field=field),self.assertRaises(RuntimeError):proof.verify_official(other,report,physical)
        other=deepcopy(summary);other['successful_requests'][3]=deepcopy(other['successful_requests'][1]);other['successful_requests'][3]['id']=5
        with self.assertRaises(RuntimeError):proof.verify_official(other,report,physical)

    def test_budget_facts_cleanup_and_missing_checks_cannot_be_self_asserted(self):
        summary,report,physical=evidence()
        for change in ('budget','answer','checks','cleanup'):
            other=deepcopy(report);case=other['cases'][0]
            if change=='budget':case['budget']['model_input_bytes']=0
            if change=='answer':case['actual']['answer']='三十天'
            if change=='checks':case['checks']={}
            if change=='cleanup':case['worker_cleanup_diagnostics']['acknowledged']=False
            with self.subTest(change=change),self.assertRaises(RuntimeError):proof.verify_official(summary,other,physical)

    def test_new_unknown_fields_types_and_wrong_profile_refuse(self):
        summary,report,physical=evidence()
        for key in ('channel_eof','close_confirmed','generation_requests'):
            other=deepcopy(summary);other[key]=True if key=='generation_requests' else 1
            with self.subTest(key=key),self.assertRaises(RuntimeError):proof.verify_official(other,report,physical)
        with self.assertRaises(RuntimeError):proof.verify_official({**summary,'debug':'private'},report,physical)
        with self.assertRaises(RuntimeError):proof.verify_official({**summary,'failure_events':[{}]},report,physical)
        with self.assertRaises(RuntimeError):proof.verify_official(summary,report,{**physical,'cases':True})
        other=deepcopy(report);other['dataset']['cases'][0]['articles'][0]['id']=True
        with self.assertRaises(RuntimeError):proof.verify_official(summary,other,physical)


class OwnedOfficialHostTests(unittest.TestCase):
    def test_actual_owned_broker_waits_for_eof_then_reaps_and_closes_pipes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'scripts').mkdir();(root/'run').mkdir(mode=0o700)
            (root/'scripts/agent-linux-official-broker.py').write_text('import sys\nsys.stdin.buffer.read()\n')
            broker=host.OwnedOfficialBroker(root/'run',SimpleNamespace(defer=nullcontext))
            with patch.object(host,'ROOT',root):broker.start()
            self.assertIsNone(broker.process.poll());self.assertNotEqual(*broker.descriptors())
            broker.close();self.assertTrue(broker.closed);self.assertEqual(broker.process.returncode,0)
            self.assertTrue(host.group_gone(broker.process));self.assertTrue(broker.process.stdout.closed)
            broker.close()

    def test_metadata_substitution_refused_and_unconfirmed_results_not_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);p=root/'file';p.write_text('{}');p.chmod(0o644)
            with self.assertRaises(RuntimeError):host.private_json(p)
            p.chmod(0o600);p.unlink();p.symlink_to(root/'missing')
            with self.assertRaises(OSError):host.private_json(p)
            broker=host.OwnedOfficialBroker(root,SimpleNamespace(defer=nullcontext))
            with self.assertRaises(RuntimeError):broker.results()

    def test_failed_process_creation_is_known_no_process_cleanup(self):
        with tempfile.TemporaryDirectory() as temporary:
            broker=host.OwnedOfficialBroker(Path(temporary),SimpleNamespace(defer=nullcontext))
            with patch.object(host.subprocess,'Popen',side_effect=OSError),self.assertRaises(OSError):broker.start()
            broker.close();self.assertTrue(broker.closed);self.assertIsNone(broker.process)

    def test_term_or_group_probe_denial_cannot_skip_kill_and_own_wait(self):
        for fault in ('term','group'):
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as temporary:
                broker=host.OwnedOfficialBroker(Path(temporary),SimpleNamespace(defer=nullcontext))
                broker.process=subprocess.Popen([sys.executable,'-I','-c','import time;time.sleep(60)'],
                    stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True)
                sent=[];killpg=os.killpg;gone=host.group_gone
                def signal_group(pid,number):
                    sent.append(number)
                    if fault=='term' and number==host.signal.SIGTERM:
                        raise PermissionError
                    return killpg(pid,number)
                def probe(process):
                    if fault=='group' and host.signal.SIGKILL not in sent:
                        raise PermissionError
                    return gone(process)
                try:
                    with patch.object(host,'EOF_WAIT_SECONDS',0),patch.object(host,'SIGNAL_STEPS',
                            ((host.signal.SIGTERM,.05),(host.signal.SIGKILL,1))),patch.object(host.os,'killpg',signal_group),patch.object(host,'group_gone',probe):
                        with self.assertRaisesRegex(RuntimeError,'^AGENT_LINUX_OFFICIAL_FAILED$'):
                            broker.close()
                    self.assertIn(host.signal.SIGKILL,sent)
                    self.assertIsNotNone(broker.process.returncode)
                    self.assertTrue(gone(broker.process));self.assertTrue(broker.closed)
                    self.assertTrue(broker.process.stdout.closed);self.assertTrue(broker.process.stdin.closed)
                finally:
                    if broker.process.poll() is None:
                        broker.process.kill();broker.process.wait(timeout=5)
                    broker.process.stdin.close();broker.process.stdout.close()


class OfficialSupervisorAdmissionTests(unittest.TestCase):
    def test_dangling_report_link_is_refused_before_any_owned_process_or_provider(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);report=root/'new.json';report.symlink_to(root/'missing')
            with patch.object(vm,'execute') as execute:
                self.assertEqual(vm.main(['--cache',str(root),'--report',str(report),'--official']),1)
            execute.assert_not_called();self.assertTrue(report.is_symlink())
            self.assertFalse((root/'missing').exists())

    def test_prepare_failure_saves_explicit_failure_not_a_native_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);report=root/'failure.json'
            with patch.object(vm,'execute',side_effect=RuntimeError):
                self.assertEqual(vm.main(['--cache',str(root),'--report',str(report),'--official']),1)
            result=json.loads(report.read_text())
            self.assertEqual(result['version'],'sun-world-linux-native-failure/1')
            self.assertIs(result['passed'],False);self.assertEqual(result['stage'],'prepare')
            self.assertIsNone(result['host']);self.assertIsNone(result['guest_build'])
            self.assertTrue(result['private_run_root_removed'])
            self.assertNotIn('linux_official_four_case_verified',result)

"""Own one privileged API broker and its pipes; never copy credentials to a VM."""

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
FAILED = 'AGENT_LINUX_OFFICIAL_FAILED'
EOF_WAIT_SECONDS = 12
SIGNAL_STEPS = ((signal.SIGTERM,10),(signal.SIGKILL,5))
FINAL_WAIT_SECONDS = 5
ENV = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C', 'TZ': 'UTC',
       'BLOG_RUNTIME_ENV': 'test', 'PYTHONDONTWRITEBYTECODE': '1'}


def fail():
    raise RuntimeError(FAILED) from None


def private_json(path, limit=262144):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= limit):
            fail()
        raw = os.read(descriptor, limit + 1)
        if len(raw) != info.st_size:
            fail()
        def pairs(items):
            value = {}
            for key, item in items:
                if key in value:
                    fail()
                value[key] = item
            return value
        return raw, json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: fail())
    finally:
        os.close(descriptor)


def group_gone(process):
    try:
        os.killpg(process.pid, 0)
        return False
    except ProcessLookupError:
        return True


class OwnedOfficialBroker:
    def __init__(self, directory, state):
        self.directory, self.state = Path(directory), state
        self.process = None
        self.closed = False
        self.summary_path = self.directory / 'broker-summary.json'
        self.evaluation_path = self.directory / 'official-evaluation.json'

    def start(self):
        if self.process is not None or self.closed:
            fail()
        for path in (self.summary_path, self.evaluation_path):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            os.close(descriptor)
        with self.state.defer():
            self.process = subprocess.Popen([os.sys.executable, str(ROOT / 'scripts/agent-linux-official-broker.py'),
                '--summary', str(self.summary_path), '--evaluation', str(self.evaluation_path)],
                cwd=ROOT, env=ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, start_new_session=True)
        if self.process.poll() is not None:
            fail()
        return self

    def descriptors(self):
        if self.process is None or self.closed or self.process.poll() is not None:
            fail()
        return (self.process.stdout.fileno(), self.process.stdin.fileno())

    def close(self):
        if self.closed:
            return
        if self.process is None:
            self.closed = True
            return
        # The VM host must already have exited: closing our final writer gives
        # the broker EOF. Never infer exit from the passage of an observation.
        errors = []
        for stream in (self.process.stdout,self.process.stdin):
            try:
                stream.close()
            except BaseException as error:
                errors.append(error)
        try:
            self.process.wait(timeout=EOF_WAIT_SECONDS)
        except subprocess.TimeoutExpired:
            pass
        except BaseException as error:
            errors.append(error)
        def settled():
            try:
                return self.process.poll() is not None and group_gone(self.process)
            except BaseException as error:
                errors.append(error)
                return False
        for number,seconds in SIGNAL_STEPS:
            if settled():
                break
            try:
                os.killpg(self.process.pid,number)
            except ProcessLookupError:
                pass
            except BaseException as error:
                errors.append(error)
            deadline = time.monotonic()+seconds
            while time.monotonic()<deadline:
                if settled():
                    break
                time.sleep(.01)
        # Even a signal or group-probe denial cannot skip our own Popen wait.
        try:
            self.process.wait(timeout=FINAL_WAIT_SECONDS)
        except BaseException as error:
            errors.append(error)
        if not settled():
            fail()
        self.closed = True
        if errors:
            fail()

    def results(self):
        if not self.closed or self.process is None or self.process.returncode != 0:
            fail()
        _, summary = private_json(self.summary_path, 65536)
        raw, evaluation = private_json(self.evaluation_path)
        if summary.get('evaluation_sha256') != hashlib.sha256(raw).hexdigest():
            fail()
        return summary, evaluation


@contextmanager
def owned_broker(directory, state, confirmations):
    broker = OwnedOfficialBroker(directory, state)
    confirmations['broker_gone'] = False
    try:
        broker.start()
        yield broker
    finally:
        with state.defer():
            broker.close()
            confirmations['broker_gone'] = broker.closed

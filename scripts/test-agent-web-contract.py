#!/usr/bin/env python3
"""Export synthetic formal HTTP/SSE contracts using owned databases and SDK."""

import argparse
from contextlib import ExitStack
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from fixture_signals import owned_interrupts


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, _message):
            self.exit(2, 'AGENT_WEB_CONTRACT_FAILED\n')
    parser = Parser(description=__doc__, allow_abbrev=False)
    for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node', 'report'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        destination = args.report.expanduser().absolute()
        if sys.platform != 'darwin' or destination.is_symlink() or destination.exists():
            raise ValueError('Explicit fresh macOS contract fixture required')
        parent = destination.parent.resolve(strict=True)
        info = parent.lstat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o700):
            raise ValueError('Private report directory required')
        destination = parent / destination.name
        node = args.node.resolve(strict=True)
        runtime = args.sdk_runtime.resolve(strict=True)
        version = subprocess.check_output([str(node), '--version'], timeout=5, text=True).strip()
        if version != 'v' + (ROOT / '.nvmrc').read_text().strip():
            raise ValueError('Repository Node required')
        sdk = load('web_owned_sdk', ROOT / 'scripts/test-agent-sdk-stack.py')
        mysql = load('web_owned_mysql', ROOT / 'scripts/test-agent-mysql.py')
        redis = load('web_owned_redis', ROOT / 'scripts/test-agent-redis.py')
        mongo = load('web_owned_mongo', ROOT / 'scripts/test-agent-mongo.py')
        with ExitStack() as stack:
            environment = stack.enter_context(redis.owned_redis(args.redis_server))
            environment = {**environment, **stack.enter_context(mongo.owned_mongo(args.mongod)),
                'SUN_WORLD_AGENT_SDK_RUNTIME': str(runtime), 'SUN_WORLD_AGENT_SDK_NODE': str(node),
                'BLOG_RUNTIME_ENV': 'test'}
            return mysql.run(args.mysqld, extra_env=environment, test_runner=sdk.owned_test_process,
                test_command=[sys.executable, str(ROOT / 'apps/api/tests/integration/web_contract.py'),
                              '--report', str(destination)], test_timeout_seconds=180)
    except KeyboardInterrupt:
        return 130
    except Exception:
        print('AGENT_WEB_CONTRACT_FAILED', file=sys.stderr)
        return 1


if __name__ == '__main__':
    with owned_interrupts():
        sys.exit(main())

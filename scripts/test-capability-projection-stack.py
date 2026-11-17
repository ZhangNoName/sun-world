#!/usr/bin/env python3
"""Current capability projection tests on owned socket-only MySQL and Redis."""

import argparse
import importlib.util
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysqld', required=True, type=Path)
    parser.add_argument('--redis-server', required=True, type=Path)
    arguments = parser.parse_args()
    mysql = load('owned_admin_mysql', ROOT / 'scripts/test-agent-mysql.py')
    redis = load('owned_admin_redis', ROOT / 'scripts/test-agent-redis.py')
    try:
        with redis.owned_redis(arguments.redis_server) as environment:
            print('Owned Redis runtime:', environment['SUN_WORLD_AGENT_REDIS_ROOT'], flush=True)
            return mysql.run(arguments.mysqld, extra_env=environment,
                test_command=[sys.executable, '-m', 'unittest', 'discover', '-v',
                    '-s', str(ROOT / 'apps/api/tests/integration'), '-p', 'test_capability_projection_stack.py'])
    except KeyboardInterrupt:
        print('Owned admin stack interrupted; cleanup completed.', file=sys.stderr)
        return 130
    except Exception:
        print('Owned admin stack failed; shared services were not used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

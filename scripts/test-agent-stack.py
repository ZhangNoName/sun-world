#!/usr/bin/env python3
"""Formal router stack checks with two owned, socket-only disposable servers.

Worker/process, model and public article bodies are explicit synthetic fixtures.
No application config, installed service, download or existing database is used.
"""

import argparse
import importlib.util
import sys
from pathlib import Path

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
    mysql = load('owned_stack_mysql', ROOT / 'scripts/test-agent-mysql.py')
    redis = load('owned_stack_redis', ROOT / 'scripts/test-agent-redis.py')
    try:
        with redis.owned_redis(arguments.redis_server) as environment:
            print('Owned stack: real MySQL + Redis; synthetic Worker/model/articles.', flush=True)
            return mysql.run(arguments.mysqld, extra_env=environment,
                test_command=[sys.executable, '-m', 'unittest', 'discover', '-v',
                    '-s', str(ROOT / 'apps/api/tests/integration'), '-p', 'test_agent_*stack.py'])
    except KeyboardInterrupt:
        print('Owned stack interrupted; owned server cleanup completed.', file=sys.stderr)
        return 130
    except Exception:
        print('Owned stack validation failed; shared services were not used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

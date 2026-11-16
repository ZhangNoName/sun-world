#!/usr/bin/env python3
"""Inspect the current official local profile's visible model IDs; never generate."""

import argparse
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'AGENT_OPENAI_INVENTORY_ARGUMENT_INVALID\n')


def main(argv=None):
    parser = Arguments(description=__doc__, allow_abbrev=False)
    parser.add_argument('--proxy-url', help='Explicit credential-free HTTP loopback proxy URL')
    arguments = parser.parse_args(argv)
    sys.path.insert(0, str(ROOT / 'apps/api'))
    sys.path.insert(0, str(ROOT / 'apps/api/tests'))
    try:
        from integration.openai_inventory import inspect_inventory
        report = asyncio.run(inspect_inventory(proxy_url=arguments.proxy_url))
        print(json.dumps(report, ensure_ascii=True, allow_nan=False, separators=(',', ':')))
        return 0
    except (KeyboardInterrupt, asyncio.CancelledError):
        print('AGENT_OPENAI_INVENTORY_CANCELLED', file=sys.stderr)
        return 130
    except Exception:
        print('AGENT_OPENAI_INVENTORY_FAILED', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Explicit local-only tokenizer capability observation; no generation or acceptance."""

import argparse
import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'AGENT_TOKENIZER_ARGUMENT_INVALID\n')


def main(argv=None):
    parser = Arguments(description=__doc__)
    parser.add_argument('--probe', action='store_true', help='Explicitly contact only the approved local-validation origin')
    parser.add_argument('--report', type=Path, help='New absolute 0600 report file (must not exist)')
    arguments = parser.parse_args(argv)
    if not arguments.probe and arguments.report is None:
        parser.print_help()
        return 0
    if not arguments.probe or arguments.report is None or not arguments.report.is_absolute():
        parser.error('invalid')
    sys.path.insert(0, str(ROOT / 'apps/api'))
    sys.path.insert(0, str(ROOT / 'apps/api/tests'))
    try:
        from integration.tokenizer_probe import probe
        result = asyncio.run(probe(arguments.report))
        print('AGENT_TOKENIZER_PROBE_OK' if result == 0 else 'AGENT_TOKENIZER_PROBE_FAILED')
        return result
    except KeyboardInterrupt:
        print('AGENT_TOKENIZER_PROBE_CANCELLED', file=sys.stderr)
        return 130
    except Exception:
        print('AGENT_TOKENIZER_PROBE_FAILED', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

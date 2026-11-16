#!/usr/bin/env python3
"""Generate the private Worker v2 schema from the backend declarations."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.modules.agent_runtime.rpc import contract


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'packages/contracts/agent/rpc-v2.json'
    rendered = json.dumps(contract(), ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not target.is_file() or target.read_text(encoding='utf-8') != rendered:
            print('Agent RPC contracts drifted; run scripts/export-agent-rpc.py', file=sys.stderr)
            return 1
        print('Agent RPC v2 contracts are current')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding='utf-8')
        print('Generated packages/contracts/agent/rpc-v2.json')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

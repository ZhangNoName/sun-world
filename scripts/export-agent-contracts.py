#!/usr/bin/env python3
"""Generate the private Agent contract from explicit Python declarations."""

import argparse
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from src.module_composition import create_module_registry


def render() -> str:
    contract = create_module_registry().export()
    skill_root = ROOT / "apps/api/src/modules/blog/agent/skills/blog-qa"
    skill = json.loads((skill_root / "manifest.json").read_text(encoding="utf-8"))
    expected = hashlib.sha256((skill_root / "SKILL.md").read_bytes()).hexdigest()
    if skill["content_sha256"] != expected:
        raise ValueError("Product Skill hash mismatch; review and update its manifest")
    registry = create_module_registry()
    if (skill["module_id"] != "blog-content" or
            f'{skill["id"]}@{skill["version"]}' not in registry.modules["blog-content"].skills or
            set(skill["tool_ids"]) != set(skill["tool_versions"]) or
            any(tool_id not in registry.tools or registry.tools[tool_id].version != version
                for tool_id, version in skill["tool_versions"].items())):
        raise ValueError("Product Skill dependency mismatch")
    contract["product_skills"] = [skill]
    canonical = json.dumps(contract, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    contract["bundle_hash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return json.dumps(contract, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = ROOT / "packages/contracts/agent/tool-catalog.json"
    rendered = render()
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != rendered:
            print("Agent contracts drifted; run scripts/export-agent-contracts.py", file=sys.stderr)
            return 1
        print("Agent contracts are current")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print("Generated packages/contracts/agent/tool-catalog.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

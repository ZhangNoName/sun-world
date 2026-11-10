#!/bin/bash
set -euo pipefail

source_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(cd -- "$source_dir/../.." && pwd -P)
node_bin=$(node -p 'process.execPath')
node_version=$(node -p 'process.versions.node')
expected_version=$(<"$source_dir/../../.nvmrc")
if [[ $(uname -s) != Darwin || ! -x /usr/bin/sandbox-exec || "$node_version" != "$expected_version" ]]; then
  printf 'This P0 runner requires macOS sandbox-exec and Node %s.\n' "$expected_version" >&2
  exit 1
fi

run_dir=$(mktemp -d /private/tmp/sun-world-dsh-p0.XXXXXX)
trap 'rm -rf -- "$run_dir"' EXIT
cp "$source_dir"/*.mjs "$source_dir/blog-qa.md" "$source_dir/package.json" "$source_dir/pnpm-lock.yaml" "$run_dir/"
cd -- "$run_dir"
corepack pnpm install --frozen-lockfile --ignore-scripts

"$node_bin" --input-type=module - "$run_dir/sandbox.sb" "$repo_dir" <<'JS'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
const quote = JSON.stringify
writeFileSync(process.argv[2], `(version 1)
(allow default)
(deny network*)
(allow network-bind (local ip "localhost:*"))
(allow network-inbound (local ip "localhost:*"))
(allow network-outbound (remote ip "localhost:*"))
(deny file-read* file-write* (subpath ${quote(homedir())}))
(allow file-read* (subpath ${quote(dirname(dirname(process.execPath)))}))
(deny file-read* file-write* (subpath ${quote(process.argv[3])}))
`)
JS
/usr/bin/time -l /usr/bin/sandbox-exec -f "$run_dir/sandbox.sb" /usr/bin/env -i \
  PATH=/usr/bin:/bin TMPDIR="$run_dir" P0_BLOCKED_FILE="$repo_dir/.nvmrc" \
  "$node_bin" run.mjs "$@"

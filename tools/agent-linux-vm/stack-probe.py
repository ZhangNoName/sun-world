"""Guest-only native loaders and pinned package metadata before database startup."""

import importlib
import importlib.metadata
import json
from pathlib import Path
import platform
import re
import subprocess
import sys

assert sys.platform == 'linux' and platform.machine() == 'aarch64'
assert sys.version_info[:3] == (3, 12, 13)
contract = json.loads(Path(__file__).with_name('stack-python.json').read_text())
for row in contract['wheels']:
    assert importlib.metadata.version(row['name']) == row['version']
for module in ('fastapi', 'uvicorn', 'httpx', 'pymysql', 'pymongo', 'redis', 'jose',
               'pydantic_core', '_cffi_backend', 'cryptography.hazmat.bindings._rust', 'orjson', 'zstandard'):
    importlib.import_module(module)
checks = [('/opt/mysql/bin/mysqld', ['--no-defaults', '--version'], r'\bVer (8\.4\.13)\b'),
          ('/opt/mongo/bin/mongod', ['--version'], r'\bdb version v(8\.0\.38)\b'),
          ('/usr/local/bin/redis-server', ['--version'], r'\bv=(7\.0\.15)\b')]
versions = []
for binary, arguments, pattern in checks:
    result = subprocess.run([binary, *arguments], capture_output=True, timeout=10)
    assert result.returncode == 0 and len(result.stdout) <= 65536 and len(result.stderr) <= 65536
    match = re.search(pattern, result.stdout.decode('utf-8', errors='strict'))
    assert match
    versions.append(match[1])
print('SW_LINUX_STACK_ASSETS_RESULT ' + json.dumps({
    'version': 'sun-world-linux-stack-assets-result/1', 'python': '3.12.13',
    'architecture': 'aarch64', 'mysql': versions[0], 'mongo': versions[1], 'redis': versions[2],
    'locked_wheels': len(contract['wheels']), 'native_imports_loaded': True}), flush=True)

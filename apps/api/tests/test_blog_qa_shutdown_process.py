"""Process-lifecycle fault injection; no SDK/model or database connections."""

import asyncio
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'tools/dsh-blog-local'))
from app_instance import Application
from dataset import create_dataset
from src.modules.agent_runtime.runtime import Runtime
from src.modules.agent_runtime.store import Store


@unittest.skipUnless(sys.platform == 'darwin' and shutil.which('node'), 'macOS/Node process probe')
class BlogQaShutdownProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_site_shutdown_reaps_an_unresponsive_worker_process(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = Path(directory)
            (worker / 'tmp').mkdir()
            (worker / 'sandbox.sb').write_text('(version 1)\n(allow default)\n')
            # Deliberately never emit a result: shutdown must reap the process.
            (worker / 'local-runner.mjs').write_text(
                "import {writeFileSync} from 'node:fs';"
                "writeFileSync('pid',String(process.pid));setInterval(()=>{},1000);"
            )
            with patch.dict(os.environ, {'DSH_LOCAL_WORKER_DIR': directory, 'DSH_LOCAL_NODE': shutil.which('node')}):
                _, tools = create_dataset()
                runtime = Runtime(Store(':memory:'), tools)
                run_id, _ = runtime.store.create(1, 'process-test', 'synthetic lifecycle probe')
                runtime.start(run_id, runtime.login(1))
                try:
                    for _ in range(200):
                        if (worker / 'pid').exists():
                            break
                        await asyncio.sleep(.01)
                    self.assertTrue((worker / 'pid').exists())
                    pid = int((worker / 'pid').read_text())
                    application = Application()
                    application.state.blog_qa_runtime = runtime
                    await application.shut_down('local')
                    with self.assertRaises(ProcessLookupError):
                        os.kill(pid, 0)
                    self.assertEqual(runtime.tasks, {})
                    self.assertFalse((worker / 'tmp' / f'run-{run_id}').exists())
                finally:
                    if runtime.tasks:
                        await runtime.aclose()

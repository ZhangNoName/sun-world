#!/usr/bin/env python3
"""Private stdio API broker. Only the VM supervisor invokes this entrypoint."""

import argparse
import asyncio
from pathlib import Path
import signal
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))


async def run(arguments):
    from official_channel_codec import AsyncFdFrames
    from official_channel_broker import serve_official_channel
    task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for number in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(number, task.cancel)
    frames = AsyncFdFrames(0, 1, own_fds=False)
    try:
        await serve_official_channel(frames, evaluation_path=arguments.evaluation,
                                     summary_path=arguments.summary)
    finally:
        await frames.aclose()
        for number in (signal.SIGINT, signal.SIGTERM):
            loop.remove_signal_handler(number)


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--summary', type=Path, required=True)
    parser.add_argument('--evaluation', type=Path, required=True)
    arguments = parser.parse_args()
    # Codec writes directly to fd 1. Incidental library print() output belongs
    # to the separately suppressed diagnostic stream, never the framed pipe.
    sys.stdout = sys.stderr
    try:
        asyncio.run(run(arguments))
        return 0
    except (KeyboardInterrupt, asyncio.CancelledError):
        return 130
    except Exception:
        # stdout is an exclusive binary channel; no errors or credentials there.
        return 1


if __name__ == '__main__':
    sys.exit(main())

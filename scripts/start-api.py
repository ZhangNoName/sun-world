from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the Sun World FastAPI app.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    api_dir = repo_root / "apps" / "api"

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    sys.path.insert(0, str(api_dir))
    sys.path.insert(0, str(api_dir / "src"))
    os.chdir(api_dir)

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        log_level="info",
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

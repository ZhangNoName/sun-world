from __future__ import annotations

from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import Iterator


SECRET_NAMES = (
    "AI_CREDENTIAL_ENCRYPTION_KEY",
    "DEEPSEEK_API_KEY",
)
ENV_ASSIGNMENT = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=")


def read_updates(payload: bytes) -> dict[str, str]:
    fields = payload.split(b"\0")
    if len(fields) != len(SECRET_NAMES) + 1 or fields[-1] != b"":
        raise ValueError("invalid payload")

    values: list[str] = []
    for field in fields[:-1]:
        value = field.decode("utf-8")
        if not value or "\n" in value or "\r" in value:
            raise ValueError("invalid payload")
        values.append(value)
    return dict(zip(SECRET_NAMES, values, strict=True))


def merge_env(existing: str, updates: dict[str, str]) -> str:
    output: list[str] = []
    written: set[str] = set()
    for line in existing.splitlines():
        match = ENV_ASSIGNMENT.match(line.strip())
        name = match.group(1) if match else ""
        if name in updates:
            if name not in written:
                output.append(f"{name}={updates[name]}")
                written.add(name)
            continue
        output.append(line)

    for name in SECRET_NAMES:
        if name not in written:
            output.append(f"{name}={updates[name]}")

    return "\n".join(output) + "\n"


def atomic_write(target: Path, content: str) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
    )
    temporary_path = Path(temporary_name)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, target)
        os.chmod(target, 0o600)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


@contextmanager
def target_lock(target: Path) -> Iterator[None]:
    lock_path = target.with_name(f".{target.name}.lock")
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError("invalid lock file")
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def main() -> int:
    if len(sys.argv) != 2:
        print("AI secret sync failed: target path is required.", file=sys.stderr)
        return 2

    target = Path(sys.argv[1])
    try:
        updates = read_updates(sys.stdin.buffer.read())
        with target_lock(target):
            existing = target.read_text(encoding="utf-8") if target.exists() else ""
            atomic_write(target, merge_env(existing, updates))
    except (OSError, UnicodeError, ValueError):
        print("AI secret sync failed.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

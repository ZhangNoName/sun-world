from __future__ import annotations

from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import BinaryIO, Iterator


CLIENT_ID_ENV = "AUTH_GOOGLE_CLIENT_ID"
CLIENT_SECRET_ENV = "AUTH_GOOGLE_CLIENT_SECRET"
EXPECTED_PROJECT_ID = "sun-world-507015"
EXPECTED_REDIRECT_URI = "https://api.sunworld.site/auth/oauth/google/callback"
MAX_JSON_BYTES = 64 * 1024
MAX_ENV_BYTES = 1024 * 1024
PORTABLE_ENV_VALUE = re.compile(r"^[A-Za-z0-9._~-]+$")
ENV_ASSIGNMENT = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=")


class ImportFailure(Exception):
    pass


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ImportFailure("duplicate JSON key")
        result[key] = value
    return result


def read_client_updates(stream: BinaryIO) -> dict[str, str]:
    payload = stream.read(MAX_JSON_BYTES + 1)
    if not payload or len(payload) > MAX_JSON_BYTES:
        raise ImportFailure("invalid JSON payload")

    try:
        document = json.loads(
            payload.decode("utf-8"),
            object_pairs_hook=_unique_object,
        )
    except (ImportFailure, UnicodeError, json.JSONDecodeError) as exc:
        raise ImportFailure("invalid JSON payload") from exc

    if not isinstance(document, dict) or set(document).isdisjoint({"web"}):
        raise ImportFailure("not a Web OAuth client")
    web = document.get("web")
    if not isinstance(web, dict):
        raise ImportFailure("not a Web OAuth client")

    client_id = web.get("client_id")
    client_secret = web.get("client_secret")
    project_id = web.get("project_id")
    redirect_uris = web.get("redirect_uris")
    if (
        not isinstance(client_id, str)
        or not client_id.endswith(".apps.googleusercontent.com")
        or not isinstance(client_secret, str)
        or project_id != EXPECTED_PROJECT_ID
        or redirect_uris != [EXPECTED_REDIRECT_URI]
    ):
        raise ImportFailure("invalid Web OAuth client")

    for value in (client_id, client_secret):
        if len(value) > 4096 or PORTABLE_ENV_VALUE.fullmatch(value) is None:
            raise ImportFailure("unsafe environment value")

    return {
        CLIENT_ID_ENV: client_id,
        CLIENT_SECRET_ENV: client_secret,
    }


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

    for name in (CLIENT_ID_ENV, CLIENT_SECRET_ENV):
        if name not in written:
            output.append(f"{name}={updates[name]}")

    return "\n".join(output) + ("\n" if output else "")


def restore_google_assignments(current: str, previous: str) -> str:
    previous_lines: dict[str, str] = {}
    for line in previous.splitlines():
        match = ENV_ASSIGNMENT.match(line.strip())
        name = match.group(1) if match else ""
        if name in (CLIENT_ID_ENV, CLIENT_SECRET_ENV) and name not in previous_lines:
            previous_lines[name] = line

    output: list[str] = []
    restored: set[str] = set()
    for line in current.splitlines():
        match = ENV_ASSIGNMENT.match(line.strip())
        name = match.group(1) if match else ""
        if name in (CLIENT_ID_ENV, CLIENT_SECRET_ENV):
            if name in previous_lines and name not in restored:
                output.append(previous_lines[name])
                restored.add(name)
            continue
        output.append(line)

    for name in (CLIENT_ID_ENV, CLIENT_SECRET_ENV):
        if name in previous_lines and name not in restored:
            output.append(previous_lines[name])

    return "\n".join(output) + ("\n" if output else "")


def extract_google_assignments(existing: str) -> str:
    """Keep only the first prior assignment for each Google OAuth secret."""

    output: list[str] = []
    saved: set[str] = set()
    for line in existing.splitlines():
        match = ENV_ASSIGNMENT.match(line.strip())
        name = match.group(1) if match else ""
        if name in (CLIENT_ID_ENV, CLIENT_SECRET_ENV) and name not in saved:
            output.append(line)
            saved.add(name)
    return "\n".join(output) + ("\n" if output else "")


def _secure_read(path: Path) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ImportFailure("cannot open protected file") from exc

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ImportFailure("protected path is not a regular file")
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ImportFailure("protected file mode must be 0600")
        if metadata.st_uid != os.geteuid() and os.geteuid() != 0:
            raise ImportFailure("protected file has an unexpected owner")

        with os.fdopen(descriptor, "rb", closefd=False) as handle:
            content = handle.read(MAX_ENV_BYTES + 1)
        if len(content) > MAX_ENV_BYTES:
            raise ImportFailure("protected file is unexpectedly large")
        return content, metadata
    finally:
        os.close(descriptor)


def _atomic_write(
    target: Path,
    content: bytes,
    *,
    owner_uid: int,
    owner_gid: int,
) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
    )
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        if os.geteuid() == 0:
            os.fchown(descriptor, owner_uid, owner_gid)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, target)
        if stat.S_IMODE(os.stat(target, follow_symlinks=False).st_mode) != 0o600:
            raise ImportFailure("protected file mode verification failed")
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


@contextmanager
def _target_lock(target: Path) -> Iterator[None]:
    lock_path = target.with_name(f".{target.name}.lock")
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as exc:
        raise ImportFailure("cannot acquire protected file lock") from exc

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ImportFailure("protected file lock is not regular")
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def _validate_target_path(target: Path) -> None:
    if not target.is_absolute() or not target.parent.is_dir():
        raise ImportFailure("invalid target path")
    parent_mode = stat.S_IMODE(target.parent.stat().st_mode)
    if parent_mode & 0o022:
        raise ImportFailure("target directory is writable by other users")


def import_client(target: Path, stream: BinaryIO) -> None:
    updates = read_client_updates(stream)
    _validate_target_path(target)
    backup = target.with_name(f".{target.name}.google-oauth.rollback")

    with _target_lock(target):
        existing_bytes, metadata = _secure_read(target)
        try:
            existing = existing_bytes.decode("utf-8")
        except UnicodeError as exc:
            raise ImportFailure("protected file is not UTF-8") from exc
        updated_bytes = merge_env(existing, updates).encode("utf-8")
        if updated_bytes == existing_bytes:
            return

        _atomic_write(
            backup,
            extract_google_assignments(existing).encode("utf-8"),
            owner_uid=metadata.st_uid,
            owner_gid=metadata.st_gid,
        )
        _atomic_write(
            target,
            updated_bytes,
            owner_uid=metadata.st_uid,
            owner_gid=metadata.st_gid,
        )


def rollback(target: Path) -> None:
    _validate_target_path(target)
    backup = target.with_name(f".{target.name}.google-oauth.rollback")

    with _target_lock(target):
        target_bytes, target_metadata = _secure_read(target)
        backup_bytes, backup_metadata = _secure_read(backup)
        if (
            backup_metadata.st_uid != target_metadata.st_uid
            or backup_metadata.st_gid != target_metadata.st_gid
        ):
            raise ImportFailure("rollback file has an unexpected owner")
        try:
            current = target_bytes.decode("utf-8")
            previous = backup_bytes.decode("utf-8")
        except UnicodeError as exc:
            raise ImportFailure("protected file is not UTF-8") from exc
        restored_bytes = restore_google_assignments(current, previous).encode("utf-8")
        if restored_bytes != target_bytes:
            _atomic_write(
                target,
                restored_bytes,
                owner_uid=target_metadata.st_uid,
                owner_gid=target_metadata.st_gid,
            )


def main() -> int:
    arguments = sys.argv[1:]
    rollback_requested = len(arguments) == 2 and arguments[0] == "--rollback"
    if len(arguments) == 1:
        target = Path(arguments[0])
    elif rollback_requested:
        target = Path(arguments[1])
    else:
        print("Google OAuth import failed.", file=sys.stderr)
        return 2

    try:
        if rollback_requested:
            rollback(target)
        else:
            import_client(target, sys.stdin.buffer)
    except (ImportFailure, OSError):
        print("Google OAuth import failed.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Verify and safely unpack a Sun World frontend runtime artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tarfile
import tempfile
from typing import Iterable
import unicodedata
from urllib.parse import urlsplit


MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_FILES = 5_000
MAX_MEMBERS = 10_000
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_PATH_BYTES = 4_096
MAX_COMPONENT_BYTES = 255
MAX_PATH_DEPTH = 64
COPY_CHUNK_BYTES = 1024 * 1024

COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class ArtifactValidationError(Exception):
    """Raised when an artifact does not satisfy the deployment contract."""


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ArtifactValidationError("manifest contains a duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(value: str) -> None:
    raise ArtifactValidationError(f"manifest contains invalid JSON constant {value}")


def _require_exact_keys(
    value: object,
    expected: set[str],
    label: str,
) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != expected:
        raise ArtifactValidationError(f"{label} does not match the required schema")
    return value


def _require_positive_int(value: object, label: str) -> int:
    if type(value) is not int or value <= 0:
        raise ArtifactValidationError(f"{label} must be a positive integer")
    return value


def _require_nonnegative_int(value: object, label: str) -> int:
    if type(value) is not int or value < 0:
        raise ArtifactValidationError(f"{label} must be a non-negative integer")
    return value


def _require_pattern(value: object, pattern: re.Pattern[str], label: str) -> str:
    if not isinstance(value, str) or pattern.fullmatch(value) is None:
        raise ArtifactValidationError(f"{label} has an invalid format")
    return value


def _contains_control_character(value: str) -> bool:
    return any(
        ord(character) < 32
        or ord(character) == 127
        or character in {"\u2028", "\u2029"}
        or unicodedata.category(character) in {"Cc", "Cf", "Cs"}
        for character in value
    )


def _require_https_url(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 2_048
        or _contains_control_character(value)
        or any(character.isspace() for character in value)
    ):
        raise ArtifactValidationError(f"{label} must be a non-empty HTTPS URL")

    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
    except ValueError as exc:
        raise ArtifactValidationError(f"{label} must be a non-empty HTTPS URL") from exc
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ArtifactValidationError(f"{label} must be a non-empty HTTPS URL")
    return value


def _open_regular_file(path: Path, label: str) -> tuple[int, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ArtifactValidationError(f"cannot open {label}") from exc

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ArtifactValidationError(f"{label} is not a regular file")
        return descriptor, metadata
    except BaseException:
        os.close(descriptor)
        raise


def _read_manifest(path: Path) -> dict[str, object]:
    descriptor, metadata = _open_regular_file(path, "manifest")
    try:
        if metadata.st_size <= 0 or metadata.st_size > MAX_MANIFEST_BYTES:
            raise ArtifactValidationError("manifest has an invalid size")
        with os.fdopen(descriptor, "rb", closefd=False) as handle:
            payload = handle.read(MAX_MANIFEST_BYTES + 1)
        if len(payload) != metadata.st_size:
            raise ArtifactValidationError("manifest changed while it was read")
        try:
            return json.loads(
                payload.decode("utf-8"),
                object_pairs_hook=_unique_object,
                parse_constant=_reject_json_constant,
            )
        except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
            raise ArtifactValidationError("manifest is not strict UTF-8 JSON") from exc
    finally:
        os.close(descriptor)


def _sha256_descriptor(descriptor: int) -> str:
    digest = hashlib.sha256()
    os.lseek(descriptor, 0, os.SEEK_SET)
    while True:
        chunk = os.read(descriptor, COPY_CHUNK_BYTES)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(descriptor, 0, os.SEEK_SET)
    return digest.hexdigest()


def _validate_relative_path(value: object, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ArtifactValidationError(f"{label} must be a non-empty path")
    if "\\" in value or _contains_control_character(value):
        raise ArtifactValidationError(f"{label} contains unsafe characters")
    try:
        encoded = value.encode("utf-8")
    except UnicodeError as exc:
        raise ArtifactValidationError(f"{label} is not valid UTF-8") from exc
    if len(encoded) > MAX_PATH_BYTES:
        raise ArtifactValidationError(f"{label} is too long")
    if unicodedata.normalize("NFC", value) != value:
        raise ArtifactValidationError(f"{label} is not Unicode-normalized")

    path = PurePosixPath(value)
    parts = value.split("/")
    if (
        path.is_absolute()
        or value.endswith("/")
        or any(part in {"", ".", ".."} for part in parts)
        or parts[0] != "dist"
        or len(parts) < 2
        or len(parts) > MAX_PATH_DEPTH
    ):
        raise ArtifactValidationError(f"{label} is not a canonical dist path")
    if any(len(part.encode("utf-8")) > MAX_COMPONENT_BYTES for part in parts):
        raise ArtifactValidationError(f"{label} contains an overlong component")
    return value


def _validate_member_path(member: tarfile.TarInfo) -> str:
    raw_name = member.name
    if not isinstance(raw_name, str) or not raw_name:
        raise ArtifactValidationError("archive member has an empty path")
    if "\\" in raw_name or _contains_control_character(raw_name):
        raise ArtifactValidationError("archive member path contains unsafe characters")
    try:
        encoded = raw_name.encode("utf-8")
    except UnicodeError as exc:
        raise ArtifactValidationError("archive member path is not valid UTF-8") from exc
    if len(encoded) > MAX_PATH_BYTES:
        raise ArtifactValidationError("archive member path is too long")
    if unicodedata.normalize("NFC", raw_name) != raw_name:
        raise ArtifactValidationError("archive member path is not Unicode-normalized")

    if raw_name.endswith("/"):
        if not member.isdir():
            raise ArtifactValidationError("only directory paths may end with a slash")
        raw_name = raw_name[:-1]
    parts = raw_name.split("/")
    if (
        PurePosixPath(raw_name).is_absolute()
        or any(part in {"", ".", ".."} for part in parts)
        or parts[0] != "dist"
        or len(parts) > MAX_PATH_DEPTH
    ):
        raise ArtifactValidationError("archive member is not a canonical dist path")
    if any(len(part.encode("utf-8")) > MAX_COMPONENT_BYTES for part in parts):
        raise ArtifactValidationError("archive member path has an overlong component")
    if not member.isdir() and len(parts) < 2:
        raise ArtifactValidationError("archive cannot replace the dist directory")
    return "/".join(parts)


def _validate_manifest(
    document: object,
    *,
    expected_commit: str,
    expected_run_id: int,
    expected_run_attempt: int,
    expected_sha256: str,
    expected_bytes: int,
    expected_file_count: int,
    expected_uncompressed_bytes: int,
) -> dict[str, dict[str, object]]:
    root = _require_exact_keys(
        document,
        {"schema_version", "commit", "run_id", "run_attempt", "build", "archive", "files"},
        "manifest",
    )
    if root["schema_version"] != 1 or type(root["schema_version"]) is not int:
        raise ArtifactValidationError("manifest schema_version must be 1")

    commit = _require_pattern(root["commit"], COMMIT_PATTERN, "manifest commit")
    run_id = _require_positive_int(root["run_id"], "manifest run_id")
    run_attempt = _require_positive_int(root["run_attempt"], "manifest run_attempt")
    if (
        commit != expected_commit
        or run_id != expected_run_id
        or run_attempt != expected_run_attempt
    ):
        raise ArtifactValidationError("manifest provenance does not match expected values")

    build = _require_exact_keys(
        root["build"],
        {"vite_base_url", "vite_telemetry_endpoint"},
        "manifest build",
    )
    _require_https_url(build["vite_base_url"], "manifest build.vite_base_url")
    _require_https_url(
        build["vite_telemetry_endpoint"],
        "manifest build.vite_telemetry_endpoint",
    )

    archive = _require_exact_keys(
        root["archive"],
        {"sha256", "bytes", "file_count", "uncompressed_bytes"},
        "manifest archive",
    )
    archive_sha256 = _require_pattern(
        archive["sha256"], SHA256_PATTERN, "manifest archive.sha256"
    )
    archive_bytes = _require_positive_int(archive["bytes"], "manifest archive.bytes")
    file_count = _require_positive_int(
        archive["file_count"], "manifest archive.file_count"
    )
    uncompressed_bytes = _require_nonnegative_int(
        archive["uncompressed_bytes"], "manifest archive.uncompressed_bytes"
    )
    if (
        archive_sha256 != expected_sha256
        or archive_bytes != expected_bytes
        or file_count != expected_file_count
        or uncompressed_bytes != expected_uncompressed_bytes
    ):
        raise ArtifactValidationError("manifest archive metadata does not match expected values")
    if file_count > MAX_FILES or uncompressed_bytes > MAX_UNCOMPRESSED_BYTES:
        raise ArtifactValidationError("manifest archive limits are exceeded")

    files_value = root["files"]
    if not isinstance(files_value, list) or len(files_value) != file_count:
        raise ArtifactValidationError("manifest files do not match file_count")

    files: dict[str, dict[str, object]] = {}
    total_bytes = 0
    for index, raw_file in enumerate(files_value):
        file_entry = _require_exact_keys(
            raw_file,
            {"path", "size", "sha256"},
            f"manifest files[{index}]",
        )
        path = _validate_relative_path(file_entry["path"], f"manifest files[{index}].path")
        size = _require_nonnegative_int(file_entry["size"], f"manifest files[{index}].size")
        sha256 = _require_pattern(
            file_entry["sha256"], SHA256_PATTERN, f"manifest files[{index}].sha256"
        )
        if path in files:
            raise ArtifactValidationError("manifest contains a duplicate file path")
        if size > MAX_FILE_BYTES:
            raise ArtifactValidationError("manifest contains an oversized file")
        total_bytes += size
        if total_bytes > MAX_UNCOMPRESSED_BYTES:
            raise ArtifactValidationError("manifest uncompressed size limit is exceeded")
        files[path] = {"size": size, "sha256": sha256}

    if total_bytes != uncompressed_bytes:
        raise ArtifactValidationError("manifest file sizes do not match uncompressed_bytes")
    return files


def _validate_path_types(path_types: dict[str, str]) -> None:
    for path in path_types:
        parts = path.split("/")
        for index in range(1, len(parts)):
            ancestor = "/".join(parts[:index])
            if path_types.get(ancestor) == "file":
                raise ArtifactValidationError("archive places an entry below a regular file")


def _inspect_archive(
    archive: tarfile.TarFile,
    manifest_files: dict[str, dict[str, object]],
) -> list[tuple[tarfile.TarInfo, str]]:
    members: list[tuple[tarfile.TarInfo, str]] = []
    path_types: dict[str, str] = {}
    archive_files: dict[str, tarfile.TarInfo] = {}
    total_bytes = 0

    for member_index, member in enumerate(archive, start=1):
        if member_index > MAX_MEMBERS:
            raise ArtifactValidationError("archive contains too many members")
        normalized_path = _validate_member_path(member)
        if normalized_path in path_types:
            raise ArtifactValidationError("archive contains a duplicate normalized path")
        if getattr(member, "sparse", None) is not None or any(
            key.startswith("GNU.sparse.") or key == "SCHILY.realsize"
            for key in member.pax_headers
        ):
            raise ArtifactValidationError("archive contains a sparse member")

        if member.type == tarfile.DIRTYPE:
            if member.size != 0:
                raise ArtifactValidationError("archive directory has a non-zero size")
            path_types[normalized_path] = "directory"
        elif member.type in {tarfile.REGTYPE, tarfile.AREGTYPE}:
            if member.size < 0 or member.size > MAX_FILE_BYTES:
                raise ArtifactValidationError("archive contains an oversized regular file")
            path_types[normalized_path] = "file"
            archive_files[normalized_path] = member
            total_bytes += member.size
            if len(archive_files) > MAX_FILES:
                raise ArtifactValidationError("archive contains too many regular files")
            if total_bytes > MAX_UNCOMPRESSED_BYTES:
                raise ArtifactValidationError("archive uncompressed size limit is exceeded")
        else:
            raise ArtifactValidationError("archive contains a non-regular member")
        members.append((member, normalized_path))

    _validate_path_types(path_types)
    if set(archive_files) != set(manifest_files):
        raise ArtifactValidationError("archive files do not match the manifest")
    if len(archive_files) != len(manifest_files):
        raise ArtifactValidationError("archive file count does not match the manifest")
    if total_bytes != sum(int(entry["size"]) for entry in manifest_files.values()):
        raise ArtifactValidationError("archive size does not match the manifest")
    for path, member in archive_files.items():
        if member.size != manifest_files[path]["size"]:
            raise ArtifactValidationError("archive member size does not match the manifest")
    return members


def _safe_target(staging: Path, relative_path: str) -> Path:
    target = staging.joinpath(*relative_path.split("/"))
    if os.path.commonpath((staging, target)) != str(staging):
        raise ArtifactValidationError("archive member escaped the staging directory")
    return target


def _create_directory(path: Path) -> None:
    try:
        path.mkdir(mode=0o755, parents=True, exist_ok=True)
    except OSError as exc:
        raise ArtifactValidationError("cannot create artifact directory") from exc
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode):
        raise ArtifactValidationError("artifact directory path is not a directory")
    os.chmod(path, 0o755, follow_symlinks=False)


def _copy_regular_file(
    archive: tarfile.TarFile,
    member: tarfile.TarInfo,
    target: Path,
    expected: dict[str, object],
) -> None:
    source = archive.extractfile(member)
    if source is None:
        raise ArtifactValidationError("cannot read an archive regular file")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(target, flags, 0o644)
    except OSError as exc:
        raise ArtifactValidationError("cannot create an extracted regular file") from exc

    digest = hashlib.sha256()
    copied = 0
    try:
        os.fchmod(descriptor, 0o644)
        with source, os.fdopen(descriptor, "wb") as destination:
            while True:
                chunk = source.read(COPY_CHUNK_BYTES)
                if not chunk:
                    break
                copied += len(chunk)
                if copied > member.size:
                    raise ArtifactValidationError("archive member exceeded its declared size")
                digest.update(chunk)
                destination.write(chunk)
            destination.flush()
            os.fsync(destination.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise

    if copied != member.size or copied != expected["size"]:
        raise ArtifactValidationError("extracted file size does not match the manifest")
    if digest.hexdigest() != expected["sha256"]:
        raise ArtifactValidationError("extracted file hash does not match the manifest")


def _extract_members(
    archive: tarfile.TarFile,
    members: Iterable[tuple[tarfile.TarInfo, str]],
    manifest_files: dict[str, dict[str, object]],
    staging: Path,
) -> None:
    for member, relative_path in members:
        target = _safe_target(staging, relative_path)
        if member.type == tarfile.DIRTYPE:
            _create_directory(target)
            continue
        _create_directory(target.parent)
        _copy_regular_file(archive, member, target, manifest_files[relative_path])

    for required_file in ("dist/index.html", "dist/spa.html"):
        required_path = _safe_target(staging, required_file)
        try:
            metadata = required_path.lstat()
        except OSError as exc:
            raise ArtifactValidationError(f"artifact is missing {required_file}") from exc
        if not stat.S_ISREG(metadata.st_mode):
            raise ArtifactValidationError(f"artifact is missing {required_file}")

    assets_path = _safe_target(staging, "dist/assets")
    try:
        assets_metadata = assets_path.lstat()
    except OSError as exc:
        raise ArtifactValidationError("artifact is missing dist/assets/") from exc
    if not stat.S_ISDIR(assets_metadata.st_mode):
        raise ArtifactValidationError("artifact is missing dist/assets/")


def _validate_expected_arguments(
    *,
    expected_commit: str,
    expected_run_id: int,
    expected_run_attempt: int,
    expected_sha256: str,
    expected_bytes: int,
    expected_file_count: int,
    expected_uncompressed_bytes: int,
) -> None:
    _require_pattern(expected_commit, COMMIT_PATTERN, "expected commit")
    _require_positive_int(expected_run_id, "expected run_id")
    _require_positive_int(expected_run_attempt, "expected run_attempt")
    _require_pattern(expected_sha256, SHA256_PATTERN, "expected SHA256")
    _require_positive_int(expected_bytes, "expected archive bytes")
    _require_positive_int(expected_file_count, "expected file_count")
    _require_nonnegative_int(expected_uncompressed_bytes, "expected uncompressed_bytes")
    if expected_bytes > MAX_ARCHIVE_BYTES:
        raise ArtifactValidationError("expected archive size exceeds the limit")
    if expected_file_count > MAX_FILES:
        raise ArtifactValidationError("expected file_count exceeds the limit")
    if expected_uncompressed_bytes > MAX_UNCOMPRESSED_BYTES:
        raise ArtifactValidationError("expected uncompressed_bytes exceeds the limit")


def verify_runtime_artifact(
    *,
    archive_path: Path,
    manifest_path: Path,
    output_path: Path,
    expected_commit: str,
    expected_run_id: int,
    expected_run_attempt: int,
    expected_sha256: str,
    expected_bytes: int,
    expected_file_count: int,
    expected_uncompressed_bytes: int,
) -> None:
    """Verify provenance, contents, and hashes before atomically unpacking."""

    _validate_expected_arguments(
        expected_commit=expected_commit,
        expected_run_id=expected_run_id,
        expected_run_attempt=expected_run_attempt,
        expected_sha256=expected_sha256,
        expected_bytes=expected_bytes,
        expected_file_count=expected_file_count,
        expected_uncompressed_bytes=expected_uncompressed_bytes,
    )
    manifest_files = _validate_manifest(
        _read_manifest(manifest_path),
        expected_commit=expected_commit,
        expected_run_id=expected_run_id,
        expected_run_attempt=expected_run_attempt,
        expected_sha256=expected_sha256,
        expected_bytes=expected_bytes,
        expected_file_count=expected_file_count,
        expected_uncompressed_bytes=expected_uncompressed_bytes,
    )

    archive_descriptor, archive_metadata = _open_regular_file(archive_path, "archive")
    staging_path: Path | None = None
    try:
        if archive_metadata.st_size != expected_bytes:
            raise ArtifactValidationError("archive byte size does not match expected bytes")
        if archive_metadata.st_size <= 0 or archive_metadata.st_size > MAX_ARCHIVE_BYTES:
            raise ArtifactValidationError("archive has an invalid size")
        if _sha256_descriptor(archive_descriptor) != expected_sha256:
            raise ArtifactValidationError("archive SHA256 does not match the expected digest")

        output_path = output_path.absolute()
        output_parent = output_path.parent
        try:
            parent_metadata = output_parent.lstat()
        except OSError as exc:
            raise ArtifactValidationError("output parent does not exist") from exc
        if not stat.S_ISDIR(parent_metadata.st_mode):
            raise ArtifactValidationError("output parent is not a real directory")
        if os.path.lexists(output_path):
            raise ArtifactValidationError("output path already exists")

        staging_path = Path(
            tempfile.mkdtemp(prefix=f".{output_path.name}.", dir=output_parent)
        )
        os.chmod(staging_path, 0o700)
        with os.fdopen(os.dup(archive_descriptor), "rb") as archive_handle:
            try:
                with tarfile.open(fileobj=archive_handle, mode="r:gz") as tar:
                    members = _inspect_archive(tar, manifest_files)
                    _extract_members(tar, members, manifest_files, staging_path)
            except (tarfile.TarError, EOFError, OSError) as exc:
                raise ArtifactValidationError("archive is not a valid gzip-compressed tar") from exc

        final_archive_metadata = os.fstat(archive_descriptor)
        if (
            final_archive_metadata.st_dev != archive_metadata.st_dev
            or final_archive_metadata.st_ino != archive_metadata.st_ino
            or final_archive_metadata.st_size != archive_metadata.st_size
            or final_archive_metadata.st_mtime_ns != archive_metadata.st_mtime_ns
            or final_archive_metadata.st_ctime_ns != archive_metadata.st_ctime_ns
            or _sha256_descriptor(archive_descriptor) != expected_sha256
        ):
            raise ArtifactValidationError("archive changed while it was verified")

        if os.path.lexists(output_path):
            raise ArtifactValidationError("output path appeared during extraction")
        try:
            os.rename(staging_path, output_path)
        except OSError as exc:
            raise ArtifactValidationError("cannot publish the verified output") from exc
        staging_path = None
    finally:
        os.close(archive_descriptor)
        if staging_path is not None:
            shutil.rmtree(staging_path, ignore_errors=True)


def _positive_int(value: str) -> int:
    if re.fullmatch(r"[1-9][0-9]*", value) is None:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return int(value, 10)


def _nonnegative_int(value: str) -> int:
    if re.fullmatch(r"(?:0|[1-9][0-9]*)", value) is None:
        raise argparse.ArgumentTypeError("must be a non-negative integer")
    return int(value, 10)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify and safely unpack a Sun World frontend runtime artifact."
    )
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--expected-run-id", required=True, type=_positive_int)
    parser.add_argument("--expected-run-attempt", required=True, type=_positive_int)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-bytes", required=True, type=_positive_int)
    parser.add_argument("--expected-file-count", required=True, type=_positive_int)
    parser.add_argument(
        "--expected-uncompressed-bytes", required=True, type=_nonnegative_int
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        verify_runtime_artifact(
            archive_path=arguments.archive,
            manifest_path=arguments.manifest,
            output_path=arguments.output,
            expected_commit=arguments.expected_commit,
            expected_run_id=arguments.expected_run_id,
            expected_run_attempt=arguments.expected_run_attempt,
            expected_sha256=arguments.expected_sha256,
            expected_bytes=arguments.expected_bytes,
            expected_file_count=arguments.expected_file_count,
            expected_uncompressed_bytes=arguments.expected_uncompressed_bytes,
        )
    except ArtifactValidationError as exc:
        print(f"frontend runtime artifact verification failed: {exc}", file=sys.stderr)
        return 1
    print("Frontend runtime artifact verified and unpacked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "deploy" / "frontend" / "verify_runtime_artifact.py"
SPEC = importlib.util.spec_from_file_location("verify_runtime_artifact", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

COMMIT = "a" * 40
RUN_ID = 123456789
RUN_ATTEMPT = 2


def regular(name: str, content: bytes) -> dict[str, object]:
    return {"name": name, "type": tarfile.REGTYPE, "content": content}


def directory(name: str, *, size: int = 0) -> dict[str, object]:
    return {"name": name, "type": tarfile.DIRTYPE, "content": b"", "size": size}


def special(
    name: str,
    member_type: bytes,
    *,
    linkname: str = "",
) -> dict[str, object]:
    return {
        "name": name,
        "type": member_type,
        "content": b"",
        "linkname": linkname,
    }


def default_entries() -> list[dict[str, object]]:
    return [
        regular("dist/assets/app.js", b""),
        directory("dist"),
        regular("dist/index.html", b"<html>index</html>"),
        directory("dist/assets"),
        regular("dist/spa.html", b"<html>spa</html>"),
    ]


class FrontendRuntimeArtifactTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.archive = self.root / "frontend-runtime.tar.gz"
        self.manifest = self.root / "frontend-runtime.json"
        self.output = self.root / "unpacked"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_archive(self, entries: list[dict[str, object]]) -> None:
        with tarfile.open(self.archive, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            for entry in entries:
                info = tarfile.TarInfo(str(entry["name"]))
                info.type = entry.get("type", tarfile.REGTYPE)  # type: ignore[assignment]
                info.mode = 0o7777
                info.uid = 99999
                info.gid = 99999
                info.linkname = str(entry.get("linkname", ""))
                info.pax_headers = dict(entry.get("pax_headers", {}))
                content = bytes(entry.get("content", b""))
                info.size = int(entry.get("size", len(content)))
                file_object = io.BytesIO(content) if info.size else None
                archive.addfile(info, file_object)

    def _manifest_files(
        self,
        entries: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        files: list[dict[str, object]] = []
        for entry in entries:
            if entry.get("type", tarfile.REGTYPE) not in {
                tarfile.REGTYPE,
                tarfile.AREGTYPE,
            }:
                continue
            content = bytes(entry.get("content", b""))
            files.append(
                {
                    "path": str(entry["name"]),
                    "size": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                }
            )
        return files

    def _write_manifest(
        self,
        manifest_entries: list[dict[str, object]],
        *,
        overrides: dict[str, object] | None = None,
    ) -> dict[str, object]:
        files = self._manifest_files(manifest_entries)
        archive_bytes = self.archive.stat().st_size
        archive_sha256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        document: dict[str, object] = {
            "schema_version": 1,
            "commit": COMMIT,
            "run_id": RUN_ID,
            "run_attempt": RUN_ATTEMPT,
            "build": {
                "vite_base_url": "https://api.sunworld.site",
                "vite_telemetry_endpoint": "https://api.sunworld.site/telemetry/events",
            },
            "archive": {
                "sha256": archive_sha256,
                "bytes": archive_bytes,
                "file_count": len(files),
                "uncompressed_bytes": sum(int(item["size"]) for item in files),
            },
            "files": files,
        }
        if overrides:
            document.update(overrides)
        self.manifest.write_text(json.dumps(document), encoding="utf-8")
        return document

    def _prepare(
        self,
        archive_entries: list[dict[str, object]] | None = None,
        *,
        manifest_entries: list[dict[str, object]] | None = None,
    ) -> dict[str, object]:
        entries = archive_entries or default_entries()
        self._write_archive(entries)
        return self._write_manifest(manifest_entries or entries)

    def _verify(
        self,
        document: dict[str, object],
        **expected_overrides: object,
    ) -> None:
        archive_meta = document["archive"]
        assert isinstance(archive_meta, dict)
        expected = {
            "expected_commit": COMMIT,
            "expected_run_id": RUN_ID,
            "expected_run_attempt": RUN_ATTEMPT,
            "expected_sha256": archive_meta["sha256"],
            "expected_bytes": archive_meta["bytes"],
            "expected_file_count": archive_meta["file_count"],
            "expected_uncompressed_bytes": archive_meta["uncompressed_bytes"],
        }
        expected.update(expected_overrides)
        validator.verify_runtime_artifact(
            archive_path=self.archive,
            manifest_path=self.manifest,
            output_path=self.output,
            **expected,
        )

    def _assert_rejected(
        self,
        document: dict[str, object],
        **expected_overrides: object,
    ) -> None:
        with self.assertRaises(validator.ArtifactValidationError):
            self._verify(document, **expected_overrides)
        self.assertFalse(self.output.exists())

    def test_valid_artifact_is_atomically_unpacked_with_safe_modes(self) -> None:
        document = self._prepare()

        self._verify(document)

        self.assertEqual(
            (self.output / "dist/index.html").read_bytes(), b"<html>index</html>"
        )
        self.assertEqual((self.output / "dist/assets/app.js").read_bytes(), b"")
        self.assertEqual(
            stat.S_IMODE((self.output / "dist/index.html").stat().st_mode), 0o644
        )
        self.assertEqual(
            stat.S_IMODE((self.output / "dist/assets").stat().st_mode), 0o755
        )
        self.assertEqual(
            sorted(path.relative_to(self.output).as_posix() for path in self.output.rglob("*")),
            [
                "dist",
                "dist/assets",
                "dist/assets/app.js",
                "dist/index.html",
                "dist/spa.html",
            ],
        )

    def test_cli_accepts_all_required_expected_arguments(self) -> None:
        document = self._prepare()
        archive_meta = document["archive"]
        assert isinstance(archive_meta, dict)
        arguments = [
            "--archive",
            str(self.archive),
            "--manifest",
            str(self.manifest),
            "--output",
            str(self.output),
            "--expected-commit",
            COMMIT,
            "--expected-run-id",
            str(RUN_ID),
            "--expected-run-attempt",
            str(RUN_ATTEMPT),
            "--expected-sha256",
            str(archive_meta["sha256"]),
            "--expected-bytes",
            str(archive_meta["bytes"]),
            "--expected-file-count",
            str(archive_meta["file_count"]),
            "--expected-uncompressed-bytes",
            str(archive_meta["uncompressed_bytes"]),
        ]

        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(validator.main(arguments), 0)
        self.assertTrue((self.output / "dist/index.html").is_file())

    def test_cli_integer_arguments_require_canonical_decimal_text(self) -> None:
        for value in ("0", "-1", "+1", " 1", "01", "1.0"):
            with self.subTest(value=value):
                with self.assertRaises(validator.argparse.ArgumentTypeError):
                    validator._positive_int(value)
        for value in ("-1", "+1", " 1", "01", "1.0"):
            with self.subTest(nonnegative=value):
                with self.assertRaises(validator.argparse.ArgumentTypeError):
                    validator._nonnegative_int(value)
        self.assertEqual(validator._positive_int("1"), 1)
        self.assertEqual(validator._nonnegative_int("0"), 0)

    def test_duplicate_json_keys_and_nonstandard_constants_are_rejected(self) -> None:
        self._write_archive(default_entries())
        archive_sha256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        archive_bytes = self.archive.stat().st_size
        for payload in (
            '{"schema_version":1,"schema_version":1}',
            '{"schema_version":NaN}',
            '{"schema_version":Infinity}',
        ):
            with self.subTest(payload=payload):
                self.manifest.write_text(payload, encoding="utf-8")
                with self.assertRaises(validator.ArtifactValidationError):
                    validator.verify_runtime_artifact(
                        archive_path=self.archive,
                        manifest_path=self.manifest,
                        output_path=self.output,
                        expected_commit=COMMIT,
                        expected_run_id=RUN_ID,
                        expected_run_attempt=RUN_ATTEMPT,
                        expected_sha256=archive_sha256,
                        expected_bytes=archive_bytes,
                        expected_file_count=3,
                        expected_uncompressed_bytes=34,
                    )
                self.assertFalse(self.output.exists())

    def test_manifest_schema_build_urls_and_integer_types_are_strict(self) -> None:
        document = self._prepare()
        cases = [
            {**document, "unexpected": True},
            {**document, "run_id": True},
            {**document, "run_attempt": 1.0},
            {
                **document,
                "build": {
                    "vite_base_url": "http://api.sunworld.site",
                    "vite_telemetry_endpoint": "https://api.sunworld.site/telemetry/events",
                },
            },
            {
                **document,
                "build": {
                    "vite_base_url": "https://user:secret@api.sunworld.site",
                    "vite_telemetry_endpoint": "https://api.sunworld.site/telemetry/events",
                },
            },
        ]
        for index, case in enumerate(cases):
            with self.subTest(index=index):
                self.manifest.write_text(json.dumps(case), encoding="utf-8")
                self._assert_rejected(document)

    def test_every_provenance_value_is_bound_to_the_expected_value(self) -> None:
        document = self._prepare()
        archive_meta = document["archive"]
        assert isinstance(archive_meta, dict)
        cases = [
            {"expected_commit": "b" * 40},
            {"expected_run_id": RUN_ID + 1},
            {"expected_run_attempt": RUN_ATTEMPT + 1},
            {"expected_sha256": "0" * 64},
            {"expected_bytes": int(archive_meta["bytes"]) + 1},
            {"expected_file_count": int(archive_meta["file_count"]) + 1},
            {
                "expected_uncompressed_bytes": int(
                    archive_meta["uncompressed_bytes"]
                )
                + 1
            },
        ]
        for expected in cases:
            with self.subTest(expected=expected):
                self._assert_rejected(document, **expected)

    def test_unsafe_and_noncanonical_member_paths_are_rejected(self) -> None:
        unsafe_paths = [
            "/tmp/escape",
            "../escape",
            "dist/../escape",
            "dist\\escape",
            "dist/line\nbreak",
            "dist/\u202eright-to-left",
            "./dist/escape",
            "dist//escape",
            "dist/./escape",
        ]
        for unsafe_path in unsafe_paths:
            with self.subTest(path=repr(unsafe_path)):
                with tempfile.TemporaryDirectory() as temporary:
                    self.root = Path(temporary)
                    self.archive = self.root / "runtime.tar.gz"
                    self.manifest = self.root / "runtime.json"
                    self.output = self.root / "output"
                    valid_entries = default_entries()
                    self._write_archive(valid_entries + [regular(unsafe_path, b"x")])
                    document = self._write_manifest(valid_entries)
                    self._assert_rejected(document)

        with tempfile.TemporaryDirectory() as temporary:
            self.root = Path(temporary)
            self.archive = self.root / "runtime.tar.gz"
            self.manifest = self.root / "runtime.json"
            self.output = self.root / "output"
            valid_entries = default_entries()
            pax_override = regular("dist/apparently-safe", b"x")
            pax_override["pax_headers"] = {"path": "../pax-escape"}
            self._write_archive(valid_entries + [pax_override])
            document = self._write_manifest(valid_entries)
            self._assert_rejected(document)

    def test_links_devices_fifo_sparse_and_contiguous_members_are_rejected(self) -> None:
        member_types = [
            (tarfile.SYMTYPE, "../victim"),
            (tarfile.LNKTYPE, "dist/index.html"),
            (tarfile.CHRTYPE, ""),
            (tarfile.BLKTYPE, ""),
            (tarfile.FIFOTYPE, ""),
            (tarfile.GNUTYPE_SPARSE, ""),
            (tarfile.CONTTYPE, ""),
        ]
        for member_type, linkname in member_types:
            with self.subTest(member_type=member_type):
                with tempfile.TemporaryDirectory() as temporary:
                    self.root = Path(temporary)
                    self.archive = self.root / "runtime.tar.gz"
                    self.manifest = self.root / "runtime.json"
                    self.output = self.root / "output"
                    valid_entries = default_entries()
                    self._write_archive(
                        valid_entries
                        + [special("dist/unsafe", member_type, linkname=linkname)]
                    )
                    document = self._write_manifest(valid_entries)
                    self._assert_rejected(document)

        with tempfile.TemporaryDirectory() as temporary:
            self.root = Path(temporary)
            self.archive = self.root / "runtime.tar.gz"
            self.manifest = self.root / "runtime.json"
            self.output = self.root / "output"
            valid_entries = default_entries()
            pax_sparse = regular("dist/pax-sparse", b"")
            pax_sparse["pax_headers"] = {"GNU.sparse.untrusted": "1"}
            self._write_archive(valid_entries + [pax_sparse])
            document = self._write_manifest(valid_entries)
            self._assert_rejected(document)

    def test_duplicate_members_and_file_ancestor_conflicts_are_rejected(self) -> None:
        duplicate_entries = default_entries() + [regular("dist/index.html", b"again")]
        self._write_archive(duplicate_entries)
        document = self._write_manifest(default_entries())
        self._assert_rejected(document)

        self.archive.unlink()
        conflict_entries = default_entries() + [
            regular("dist/conflict", b"file"),
            regular("dist/conflict/child", b"child"),
        ]
        self._write_archive(conflict_entries)
        document = self._write_manifest(default_entries())
        self._assert_rejected(document)

    def test_manifest_and_archive_must_be_a_file_for_file_bijection(self) -> None:
        valid_entries = default_entries()
        archive_entries = valid_entries + [regular("dist/assets/extra.js", b"extra")]
        self._write_archive(archive_entries)
        document = self._write_manifest(valid_entries)

        self._assert_rejected(document)

    def test_late_file_hash_failure_cleans_private_staging_and_output(self) -> None:
        document = self._prepare()
        files = document["files"]
        assert isinstance(files, list) and isinstance(files[-1], dict)
        files[-1]["sha256"] = "0" * 64
        self.manifest.write_text(json.dumps(document), encoding="utf-8")

        self._assert_rejected(document)
        self.assertEqual(
            [path for path in self.root.iterdir() if path.name.startswith(".unpacked.")],
            [],
        )

    def test_required_entrypoints_and_assets_directory_are_enforced(self) -> None:
        invalid_entry_sets = [
            [directory("dist"), regular("dist/spa.html", b"spa"), directory("dist/assets")],
            [directory("dist"), regular("dist/index.html", b"index"), directory("dist/assets")],
            [
                directory("dist"),
                regular("dist/index.html", b"index"),
                regular("dist/spa.html", b"spa"),
            ],
        ]
        for entries in invalid_entry_sets:
            with self.subTest(entries=[entry["name"] for entry in entries]):
                with tempfile.TemporaryDirectory() as temporary:
                    self.root = Path(temporary)
                    self.archive = self.root / "runtime.tar.gz"
                    self.manifest = self.root / "runtime.json"
                    self.output = self.root / "output"
                    self._write_archive(entries)
                    document = self._write_manifest(entries)
                    self._assert_rejected(document)

    def test_output_is_never_overwritten_or_removed(self) -> None:
        document = self._prepare()
        self.output.mkdir()
        sentinel = self.output / "sentinel"
        sentinel.write_text("keep", encoding="utf-8")

        with self.assertRaises(validator.ArtifactValidationError):
            self._verify(document)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_archive_and_policy_limits_cannot_be_raised_by_expected_values(self) -> None:
        document = self._prepare()
        with mock.patch.object(validator, "MAX_FILES", 2):
            self._assert_rejected(document)
        with mock.patch.object(validator, "MAX_FILE_BYTES", 3):
            self._assert_rejected(document)
        with mock.patch.object(validator, "MAX_UNCOMPRESSED_BYTES", 10):
            self._assert_rejected(document)
        with mock.patch.object(validator, "MAX_MEMBERS", 2):
            self._assert_rejected(document)

    def test_nonzero_directory_size_and_corrupt_gzip_are_rejected(self) -> None:
        entries = default_entries()
        entries[1] = directory("dist", size=1)
        entries[1]["content"] = b"x"
        self._write_archive(entries)
        document = self._write_manifest(default_entries())
        self._assert_rejected(document)

        self.archive.write_bytes(b"not a gzip tar")
        archive_meta = document["archive"]
        assert isinstance(archive_meta, dict)
        archive_meta["bytes"] = self.archive.stat().st_size
        archive_meta["sha256"] = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.manifest.write_text(json.dumps(document), encoding="utf-8")
        self._assert_rejected(document)


if __name__ == "__main__":
    unittest.main()

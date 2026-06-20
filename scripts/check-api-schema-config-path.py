from __future__ import annotations

import tempfile
from pathlib import Path
import sys


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


ROOT = repo_root()
sys.path.insert(0, str(ROOT / "apps" / "api"))

from src.database.mysql import schema_migration  # noqa: E402


def check_local_layout() -> None:
    resolved = schema_migration.resolve_config_path("./src/conf/local.yml")
    expected = ROOT / "apps" / "api" / "src" / "conf" / "local.yml"
    if resolved != expected.resolve():
        raise AssertionError(f"local config path mismatch: {resolved} != {expected}")


def check_container_layout() -> None:
    original_file = schema_migration.__file__
    with tempfile.TemporaryDirectory() as temp_dir:
        app_root = Path(temp_dir) / "app"
        (app_root / "src" / "conf").mkdir(parents=True)
        (app_root / "src" / "database" / "mysql").mkdir(parents=True)
        (app_root / "main.py").write_text("print('sun world api')\n", encoding="utf-8")
        try:
            schema_migration.__file__ = str(
                app_root / "src" / "database" / "mysql" / "schema_migration.py"
            )
            resolved = schema_migration.resolve_config_path("./src/conf/local.yml")
            expected = app_root / "src" / "conf" / "local.yml"
            if resolved != expected.resolve():
                raise AssertionError(f"container config path mismatch: {resolved} != {expected}")
        finally:
            schema_migration.__file__ = original_file


def main() -> int:
    check_local_layout()
    check_container_layout()
    print("API schema config path check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

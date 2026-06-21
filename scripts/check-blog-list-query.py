from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from src.controller.blog_manage import build_blog_list_query


def assert_contains(value: str, expected: str) -> None:
    if expected not in value:
        raise AssertionError(f"Expected SQL to contain {expected!r}, got: {value}")


def main() -> int:
    sql, params = build_blog_list_query(page=1, page_size=5)
    assert_contains(sql, "WHERE COALESCE(is_deleted, 0) = 0")
    assert_contains(sql, "ORDER BY updated_at DESC, id DESC")
    if params != [5, 0]:
        raise AssertionError(f"Unexpected default params: {params!r}")

    sql, params = build_blog_list_query(
        page=2,
        page_size=10,
        keyword="Vue",
        sort_by="view_num",
        sort_order="desc",
    )
    assert_contains(sql, "(title LIKE %s OR abstract LIKE %s)")
    assert_contains(sql, "ORDER BY view_num DESC, id DESC")
    if params != ["%Vue%", "%Vue%", 10, 10]:
        raise AssertionError(f"Unexpected search params: {params!r}")

    sql, params = build_blog_list_query(
        page=1,
        page_size=10,
        sort_by="title; DROP TABLE blog",
        sort_order="sideways",
    )
    assert_contains(sql, "ORDER BY updated_at DESC, id DESC")
    if params != [10, 0]:
        raise AssertionError(f"Unexpected sanitized params: {params!r}")

    print("Blog list query protocol check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

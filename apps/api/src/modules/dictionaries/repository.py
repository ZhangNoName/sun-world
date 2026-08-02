from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Protocol

import pymysql

from .errors import DictionaryDomainError
from .schemas import (
    DictionaryItem,
    DictionaryItemInput,
    DictionaryItemPublic,
    DictionaryPage,
    DictionaryType,
    DictionaryTypeInput,
)


class DictionaryRepository(Protocol):
    async def get_enabled_items(self, code: str) -> list[DictionaryItemPublic]: ...

    async def list_types(self, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryType]: ...

    async def create_type(self, value: DictionaryTypeInput) -> DictionaryType: ...

    async def update_type(self, type_id: int, value: DictionaryTypeInput) -> DictionaryType: ...

    async def delete_type(self, type_id: int) -> None: ...

    async def list_items(self, type_id: int, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryItem]: ...

    async def create_item(self, type_id: int, value: DictionaryItemInput) -> DictionaryItem: ...

    async def update_item(self, type_id: int, item_id: int, value: DictionaryItemInput) -> DictionaryItem: ...

    async def delete_item(self, type_id: int, item_id: int) -> None: ...


class InMemoryDictionaryRepository:
    def __init__(self):
        self._types: dict[int, DictionaryType] = {}
        self._items: dict[int, DictionaryItem] = {}
        self._next_type_id = 1
        self._next_item_id = 1

    async def get_enabled_items(self, code: str) -> list[DictionaryItemPublic]:
        dictionary = next(
            (item for item in self._types.values() if item.code == code and item.is_enabled),
            None,
        )
        if dictionary is None:
            return []
        return [
            DictionaryItemPublic(**item.model_dump())
            for item in sorted(
                (
                    item
                    for item in self._items.values()
                    if item.dictionary_type_id == dictionary.id and item.is_enabled
                ),
                key=lambda item: (item.sort_order, item.id),
            )
        ]

    async def list_types(self, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryType]:
        normalized = (keyword or "").strip().lower()
        values = [
            item
            for item in self._types.values()
            if not normalized or normalized in item.code.lower() or normalized in item.name.lower()
        ]
        return _page(values, page, page_size)

    async def create_type(self, value: DictionaryTypeInput) -> DictionaryType:
        if any(item.code == value.code for item in self._types.values()):
            raise DictionaryDomainError("DICTIONARY_TYPE_ALREADY_EXISTS", "Dictionary type already exists.", 409)
        now = datetime.now(timezone.utc)
        result = DictionaryType(id=self._next_type_id, **value.model_dump(), created_at=now, updated_at=now)
        self._next_type_id += 1
        self._types[result.id] = result
        return result

    async def update_type(self, type_id: int, value: DictionaryTypeInput) -> DictionaryType:
        existing = self._types.get(type_id)
        if existing is None:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        if any(item.code == value.code and item.id != type_id for item in self._types.values()):
            raise DictionaryDomainError("DICTIONARY_TYPE_ALREADY_EXISTS", "Dictionary type already exists.", 409)
        result = DictionaryType(
            id=type_id,
            **value.model_dump(),
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._types[type_id] = result
        return result

    async def delete_type(self, type_id: int) -> None:
        if type_id not in self._types:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        if any(item.dictionary_type_id == type_id for item in self._items.values()):
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_EMPTY", "Remove dictionary items first.", 409)
        del self._types[type_id]

    async def list_items(self, type_id: int, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryItem]:
        self._require_type(type_id)
        normalized = (keyword or "").strip().lower()
        values = [
            item
            for item in self._items.values()
            if item.dictionary_type_id == type_id
            and (not normalized or normalized in item.value.lower() or normalized in item.label.lower())
        ]
        values.sort(key=lambda item: (item.sort_order, item.id))
        return _page(values, page, page_size)

    async def create_item(self, type_id: int, value: DictionaryItemInput) -> DictionaryItem:
        self._require_type(type_id)
        if any(item.dictionary_type_id == type_id and item.value == value.value for item in self._items.values()):
            raise DictionaryDomainError("DICTIONARY_ITEM_ALREADY_EXISTS", "Dictionary item already exists.", 409)
        now = datetime.now(timezone.utc)
        result = DictionaryItem(
            id=self._next_item_id,
            dictionary_type_id=type_id,
            **value.model_dump(),
            created_at=now,
            updated_at=now,
        )
        self._next_item_id += 1
        self._items[result.id] = result
        return result

    async def update_item(self, type_id: int, item_id: int, value: DictionaryItemInput) -> DictionaryItem:
        self._require_type(type_id)
        existing = self._items.get(item_id)
        if existing is None or existing.dictionary_type_id != type_id:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item not found.", 404)
        if any(
            item.dictionary_type_id == type_id and item.value == value.value and item.id != item_id
            for item in self._items.values()
        ):
            raise DictionaryDomainError("DICTIONARY_ITEM_ALREADY_EXISTS", "Dictionary item already exists.", 409)
        result = DictionaryItem(
            id=item_id,
            dictionary_type_id=type_id,
            **value.model_dump(),
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._items[item_id] = result
        return result

    async def delete_item(self, type_id: int, item_id: int) -> None:
        self._require_type(type_id)
        existing = self._items.get(item_id)
        if existing is None or existing.dictionary_type_id != type_id:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item not found.", 404)
        del self._items[item_id]

    def _require_type(self, type_id: int) -> DictionaryType:
        dictionary = self._types.get(type_id)
        if dictionary is None:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        return dictionary


class MySqlDictionaryRepository:
    def __init__(self, db):
        self.db = db

    async def get_enabled_items(self, code: str) -> list[DictionaryItemPublic]:
        rows = self.db.fetch_all(
            "SELECT i.value, i.label, i.color, i.sort_order "
            "FROM dictionary_items i JOIN dictionary_types t ON t.id = i.dictionary_type_id "
            "WHERE t.code = %s AND t.is_enabled = 1 AND i.is_enabled = 1 "
            "ORDER BY i.sort_order ASC, i.id ASC",
            (code,),
        )
        return [DictionaryItemPublic(**row) for row in rows]

    async def list_types(self, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryType]:
        where, params = _keyword_clause(keyword, ("code", "name"))
        total_row = self.db.fetch_one(f"SELECT COUNT(*) AS total FROM dictionary_types {where}", tuple(params))
        rows = self.db.fetch_all(
            "SELECT id, code, name, description, is_enabled, created_at, updated_at "
            f"FROM dictionary_types {where} ORDER BY id DESC LIMIT %s OFFSET %s",
            tuple(params + [min(max(page_size, 1), 100), (max(page, 1) - 1) * min(max(page_size, 1), 100)]),
        )
        return DictionaryPage(
            list=[DictionaryType(**row) for row in rows],
            page=max(page, 1),
            page_size=min(max(page_size, 1), 100),
            total=int((total_row or {}).get("total", 0)),
        )

    async def create_type(self, value: DictionaryTypeInput) -> DictionaryType:
        try:
            self.db.execute(
                "INSERT INTO dictionary_types (code, name, description, is_enabled) VALUES (%s, %s, %s, %s)",
                (value.code, value.name, value.description, value.is_enabled),
            )
        except pymysql.IntegrityError as error:
            raise DictionaryDomainError("DICTIONARY_TYPE_ALREADY_EXISTS", "Dictionary type already exists.", 409) from error
        row = self.db.fetch_one(
            "SELECT id, code, name, description, is_enabled, created_at, updated_at FROM dictionary_types WHERE code = %s",
            (value.code,),
        )
        if not row:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type was not created.", 500)
        return DictionaryType(**row)

    async def update_type(self, type_id: int, value: DictionaryTypeInput) -> DictionaryType:
        try:
            affected = self.db.execute(
                "UPDATE dictionary_types SET code = %s, name = %s, description = %s, is_enabled = %s WHERE id = %s",
                (value.code, value.name, value.description, value.is_enabled, type_id),
            )
        except pymysql.IntegrityError as error:
            raise DictionaryDomainError("DICTIONARY_TYPE_ALREADY_EXISTS", "Dictionary type already exists.", 409) from error
        if not affected:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        row = self.db.fetch_one(
            "SELECT id, code, name, description, is_enabled, created_at, updated_at FROM dictionary_types WHERE id = %s",
            (type_id,),
        )
        if not row:
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        return DictionaryType(**row)

    async def delete_type(self, type_id: int) -> None:
        if not self.db.fetch_one("SELECT id FROM dictionary_types WHERE id = %s", (type_id,)):
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)
        if self.db.fetch_one("SELECT id FROM dictionary_items WHERE dictionary_type_id = %s LIMIT 1", (type_id,)):
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_EMPTY", "Remove dictionary items first.", 409)
        self.db.execute("DELETE FROM dictionary_types WHERE id = %s", (type_id,))

    async def list_items(self, type_id: int, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryItem]:
        self._require_type(type_id)
        where, params = _keyword_clause(keyword, ("value", "label"), "dictionary_type_id = %s", [type_id])
        size = min(max(page_size, 1), 100)
        total_row = self.db.fetch_one(f"SELECT COUNT(*) AS total FROM dictionary_items {where}", tuple(params))
        rows = self.db.fetch_all(
            "SELECT id, dictionary_type_id, value, label, color, sort_order, is_enabled, extension_json, created_at, updated_at "
            f"FROM dictionary_items {where} ORDER BY sort_order ASC, id ASC LIMIT %s OFFSET %s",
            tuple(params + [size, (max(page, 1) - 1) * size]),
        )
        return DictionaryPage(
            list=[_item_from_row(row) for row in rows],
            page=max(page, 1),
            page_size=size,
            total=int((total_row or {}).get("total", 0)),
        )

    async def create_item(self, type_id: int, value: DictionaryItemInput) -> DictionaryItem:
        self._require_type(type_id)
        try:
            item_id = self.db.execute(
                "INSERT INTO dictionary_items (dictionary_type_id, value, label, color, sort_order, is_enabled, extension_json) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (type_id, value.value, value.label, value.color, value.sort_order, value.is_enabled, _json(value.extension_json)),
            )
        except pymysql.IntegrityError as error:
            raise DictionaryDomainError("DICTIONARY_ITEM_ALREADY_EXISTS", "Dictionary item already exists.", 409) from error
        row = self.db.fetch_one(
            "SELECT id, dictionary_type_id, value, label, color, sort_order, is_enabled, extension_json, created_at, updated_at "
            "FROM dictionary_items WHERE id = %s",
            (item_id,),
        )
        if not row:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item was not created.", 500)
        return _item_from_row(row)

    async def update_item(self, type_id: int, item_id: int, value: DictionaryItemInput) -> DictionaryItem:
        self._require_type(type_id)
        try:
            affected = self.db.execute(
                "UPDATE dictionary_items SET value = %s, label = %s, color = %s, sort_order = %s, is_enabled = %s, extension_json = %s "
                "WHERE id = %s AND dictionary_type_id = %s",
                (value.value, value.label, value.color, value.sort_order, value.is_enabled, _json(value.extension_json), item_id, type_id),
            )
        except pymysql.IntegrityError as error:
            raise DictionaryDomainError("DICTIONARY_ITEM_ALREADY_EXISTS", "Dictionary item already exists.", 409) from error
        if not affected:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item not found.", 404)
        row = self.db.fetch_one(
            "SELECT id, dictionary_type_id, value, label, color, sort_order, is_enabled, extension_json, created_at, updated_at "
            "FROM dictionary_items WHERE id = %s",
            (item_id,),
        )
        if not row:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item not found.", 404)
        return _item_from_row(row)

    async def delete_item(self, type_id: int, item_id: int) -> None:
        self._require_type(type_id)
        affected = self.db.execute(
            "DELETE FROM dictionary_items WHERE id = %s AND dictionary_type_id = %s",
            (item_id, type_id),
        )
        if not affected:
            raise DictionaryDomainError("DICTIONARY_ITEM_NOT_FOUND", "Dictionary item not found.", 404)

    def _require_type(self, type_id: int) -> None:
        if not self.db.fetch_one("SELECT id FROM dictionary_types WHERE id = %s", (type_id,)):
            raise DictionaryDomainError("DICTIONARY_TYPE_NOT_FOUND", "Dictionary type not found.", 404)


def _keyword_clause(
    keyword: str | None,
    fields: tuple[str, ...],
    prefix: str | None = None,
    prefix_params: list | None = None,
) -> tuple[str, list]:
    clauses: list[str] = []
    params = list(prefix_params or [])
    if prefix:
        clauses.append(prefix)
    normalized = (keyword or "").strip()
    if normalized:
        clauses.append("(" + " OR ".join(f"{field} LIKE %s" for field in fields) + ")")
        params.extend([f"%{normalized}%"] * len(fields))
    return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


def _json(value: dict | None) -> str | None:
    return json.dumps(value, ensure_ascii=False) if value is not None else None


def _item_from_row(row: dict) -> DictionaryItem:
    extension = row.get("extension_json")
    if isinstance(extension, str):
        extension = json.loads(extension)
    return DictionaryItem(**{**row, "extension_json": extension})


def _page(values: list, page: int, page_size: int) -> DictionaryPage:
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, 100))
    start = (safe_page - 1) * safe_page_size
    return DictionaryPage(
        list=values[start : start + safe_page_size],
        page=safe_page,
        page_size=safe_page_size,
        total=len(values),
    )

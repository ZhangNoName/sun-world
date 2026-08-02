from __future__ import annotations

from .repository import DictionaryRepository
from .schemas import (
    DictionaryItem,
    DictionaryItemInput,
    DictionaryItemPublic,
    DictionaryPage,
    DictionaryType,
    DictionaryTypeInput,
)


class DictionaryService:
    def __init__(self, repository: DictionaryRepository):
        self.repository = repository

    async def get_enabled_items(self, code: str) -> list[DictionaryItemPublic]:
        return await self.repository.get_enabled_items(code.strip())

    async def list_types(self, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryType]:
        return await self.repository.list_types(page, page_size, keyword)

    async def create_type(self, value: DictionaryTypeInput) -> DictionaryType:
        return await self.repository.create_type(value)

    async def update_type(self, type_id: int, value: DictionaryTypeInput) -> DictionaryType:
        return await self.repository.update_type(type_id, value)

    async def delete_type(self, type_id: int) -> None:
        await self.repository.delete_type(type_id)

    async def list_items(self, type_id: int, page: int, page_size: int, keyword: str | None) -> DictionaryPage[DictionaryItem]:
        return await self.repository.list_items(type_id, page, page_size, keyword)

    async def create_item(self, type_id: int, value: DictionaryItemInput) -> DictionaryItem:
        return await self.repository.create_item(type_id, value)

    async def update_item(self, type_id: int, item_id: int, value: DictionaryItemInput) -> DictionaryItem:
        return await self.repository.update_item(type_id, item_id, value)

    async def delete_item(self, type_id: int, item_id: int) -> None:
        await self.repository.delete_item(type_id, item_id)

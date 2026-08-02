from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app_instance import app
from src.core.response import ApiResponse, ok
from src.routers.auth.auth import require_admin

from .errors import DictionaryDomainError
from .schemas import (
    DictionaryItem,
    DictionaryItemInput,
    DictionaryItemPublic,
    DictionaryPage,
    DictionaryType,
    DictionaryTypeInput,
)
from .service import DictionaryService


router = APIRouter()


def get_dictionary_service() -> DictionaryService:
    service = getattr(app, "dictionary_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Dictionary service is not initialized")
    return service


def _raise_http(error: DictionaryDomainError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


@router.get("/dictionaries/{code}", response_model=ApiResponse[list[DictionaryItemPublic]])
async def get_enabled_dictionary(
    code: str,
    service: DictionaryService = Depends(get_dictionary_service),
):
    return ok(data=await service.get_enabled_items(code), msg="Dictionary loaded")


@router.get("/admin/dictionaries/types", response_model=ApiResponse[DictionaryPage[DictionaryType]])
async def list_dictionary_types(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    keyword: str | None = Query(default=None, max_length=128),
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    return ok(data=await service.list_types(page, page_size, keyword), msg="Dictionary types loaded")


@router.post("/admin/dictionaries/types", response_model=ApiResponse[DictionaryType])
async def create_dictionary_type(
    body: DictionaryTypeInput,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        result = await service.create_type(body)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=result, msg="Dictionary type created")


@router.put("/admin/dictionaries/types/{type_id}", response_model=ApiResponse[DictionaryType])
async def update_dictionary_type(
    type_id: int,
    body: DictionaryTypeInput,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        result = await service.update_type(type_id, body)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=result, msg="Dictionary type updated")


@router.delete("/admin/dictionaries/types/{type_id}", response_model=ApiResponse[None])
async def delete_dictionary_type(
    type_id: int,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        await service.delete_type(type_id)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=None, msg="Dictionary type deleted")


@router.get("/admin/dictionaries/types/{type_id}/items", response_model=ApiResponse[DictionaryPage[DictionaryItem]])
async def list_dictionary_items(
    type_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    keyword: str | None = Query(default=None, max_length=128),
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        result = await service.list_items(type_id, page, page_size, keyword)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=result, msg="Dictionary items loaded")


@router.post("/admin/dictionaries/types/{type_id}/items", response_model=ApiResponse[DictionaryItem])
async def create_dictionary_item(
    type_id: int,
    body: DictionaryItemInput,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        result = await service.create_item(type_id, body)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=result, msg="Dictionary item created")


@router.put("/admin/dictionaries/types/{type_id}/items/{item_id}", response_model=ApiResponse[DictionaryItem])
async def update_dictionary_item(
    type_id: int,
    item_id: int,
    body: DictionaryItemInput,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        result = await service.update_item(type_id, item_id, body)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=result, msg="Dictionary item updated")


@router.delete("/admin/dictionaries/types/{type_id}/items/{item_id}", response_model=ApiResponse[None])
async def delete_dictionary_item(
    type_id: int,
    item_id: int,
    _current_user=Depends(require_admin),
    service: DictionaryService = Depends(get_dictionary_service),
):
    try:
        await service.delete_item(type_id, item_id)
    except DictionaryDomainError as error:
        _raise_http(error)
    return ok(data=None, msg="Dictionary item deleted")

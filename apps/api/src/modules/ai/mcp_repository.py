from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

import pymysql

from .errors import AiDomainError
from .mcp_schemas import (
    AiMcpCallTerminalStatus,
    AiMcpConnection,
    AiMcpConnectionCreate,
    AiMcpDiscoveredTool,
    AiMcpTool,
)


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _load_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    loaded = json.loads(value)
    return loaded if isinstance(loaded, dict) else {}


def _connection_changed() -> AiDomainError:
    return AiDomainError(
        "AI_MCP_CONNECTION_CHANGED",
        "The MCP connection changed during this request. Reload it and discover tools again.",
        status_code=409,
    )


def _rediscovery_required() -> AiDomainError:
    return AiDomainError(
        "AI_MCP_REDISCOVERY_REQUIRED",
        "The saved tool catalog does not match the current MCP connection. Discover tools again before calling it.",
        status_code=409,
    )


def _require_current_catalog(connection: AiMcpConnection) -> None:
    if connection.catalog_revision != connection.revision:
        raise _rediscovery_required()


@dataclass(frozen=True)
class AiMcpConnectionRecord:
    connection: AiMcpConnection
    bearer_token_ciphertext: str | None


class AiMcpRepository(Protocol):
    async def list_connections(self, user_id: int) -> list[AiMcpConnection]: ...

    async def create_connection(
        self,
        user_id: int,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
    ) -> AiMcpConnection: ...

    async def get_connection_record(
        self,
        user_id: int,
        connection_id: str,
    ) -> AiMcpConnectionRecord: ...

    async def update_connection(
        self,
        user_id: int,
        connection_id: str,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
        expected_revision: int,
    ) -> AiMcpConnection: ...

    async def delete_connection(self, user_id: int, connection_id: str) -> None: ...

    async def replace_tools(
        self,
        user_id: int,
        connection_id: str,
        tools: list[AiMcpDiscoveredTool],
        expected_revision: int,
    ) -> tuple[AiMcpConnection, list[AiMcpTool]]: ...

    async def list_tools(self, user_id: int, connection_id: str) -> list[AiMcpTool]: ...

    async def get_tool(
        self,
        user_id: int,
        connection_id: str,
        tool_name: str,
    ) -> AiMcpTool: ...

    async def begin_call(
        self,
        *,
        call_id: str,
        user_id: int,
        connection_id: str,
        tool_name: str,
        argument_keys: list[str],
        connection_revision: int,
    ) -> None: ...

    async def complete_call(
        self,
        *,
        call_id: str,
        user_id: int,
        status: AiMcpCallTerminalStatus,
        result_metadata: dict[str, Any] | None,
        error_code: str | None,
        duration_ms: int,
    ) -> None: ...


class InMemoryAiMcpRepository:
    def __init__(self) -> None:
        self._connections: dict[str, tuple[int, AiMcpConnection, str | None]] = {}
        self._tools: dict[tuple[str, str], AiMcpTool] = {}
        self.calls: list[dict[str, Any]] = []

    def _assert_unique_name(
        self,
        user_id: int,
        name: str,
        *,
        exclude_id: str | None = None,
    ) -> None:
        normalized = name.casefold()
        duplicate = any(
            owner == user_id
            and connection.id != exclude_id
            and connection.name.casefold() == normalized
            for owner, connection, _ciphertext in self._connections.values()
        )
        if duplicate:
            raise AiDomainError(
                "AI_MCP_CONNECTION_NAME_CONFLICT",
                "An MCP connection with this name already exists.",
                status_code=409,
            )

    async def list_connections(self, user_id: int) -> list[AiMcpConnection]:
        values = [
            connection
            for owner, connection, _ciphertext in self._connections.values()
            if owner == user_id
        ]
        return sorted(values, key=lambda item: (item.updated_at, item.id), reverse=True)

    async def create_connection(
        self,
        user_id: int,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
    ) -> AiMcpConnection:
        self._assert_unique_name(user_id, value.name)
        connection = AiMcpConnection(
            id=_id("mcp"),
            name=value.name,
            endpoint=value.endpoint,
            enabled=value.enabled,
            has_bearer_token=bearer_token_ciphertext is not None,
            bearer_token_hint=bearer_token_hint,
        )
        self._connections[connection.id] = (
            user_id,
            connection,
            bearer_token_ciphertext,
        )
        return connection

    async def get_connection_record(
        self,
        user_id: int,
        connection_id: str,
    ) -> AiMcpConnectionRecord:
        found = self._connections.get(connection_id)
        if found is None or found[0] != user_id:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "MCP connection not found.",
                status_code=404,
            )
        return AiMcpConnectionRecord(found[1], found[2])

    async def update_connection(
        self,
        user_id: int,
        connection_id: str,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
        expected_revision: int,
    ) -> AiMcpConnection:
        existing = await self.get_connection_record(user_id, connection_id)
        if existing.connection.revision != expected_revision:
            raise _connection_changed()
        self._assert_unique_name(user_id, value.name, exclude_id=connection_id)
        remote_configuration_changed = (
            existing.connection.endpoint != value.endpoint
            or existing.connection.enabled != value.enabled
            or existing.bearer_token_ciphertext != bearer_token_ciphertext
        )
        revision = existing.connection.revision + 1
        if remote_configuration_changed:
            for key in [key for key in self._tools if key[0] == connection_id]:
                del self._tools[key]
            catalog_revision = None
            last_discovered_at = None
        else:
            catalog_revision = (
                revision
                if existing.connection.catalog_revision == existing.connection.revision
                else existing.connection.catalog_revision
            )
            last_discovered_at = existing.connection.last_discovered_at
        connection = AiMcpConnection(
            id=connection_id,
            name=value.name,
            endpoint=value.endpoint,
            enabled=value.enabled,
            has_bearer_token=bearer_token_ciphertext is not None,
            bearer_token_hint=bearer_token_hint,
            revision=revision,
            catalog_revision=catalog_revision,
            last_discovered_at=last_discovered_at,
            created_at=existing.connection.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._connections[connection_id] = (
            user_id,
            connection,
            bearer_token_ciphertext,
        )
        return connection

    async def delete_connection(self, user_id: int, connection_id: str) -> None:
        await self.get_connection_record(user_id, connection_id)
        del self._connections[connection_id]
        for key in [key for key in self._tools if key[0] == connection_id]:
            del self._tools[key]

    async def replace_tools(
        self,
        user_id: int,
        connection_id: str,
        tools: list[AiMcpDiscoveredTool],
        expected_revision: int,
    ) -> tuple[AiMcpConnection, list[AiMcpTool]]:
        record = await self.get_connection_record(user_id, connection_id)
        if record.connection.revision != expected_revision:
            raise _connection_changed()
        if not record.connection.enabled:
            raise AiDomainError(
                "AI_MCP_CONNECTION_DISABLED",
                "Enable this MCP connection before contacting it.",
                status_code=409,
            )
        for key in [key for key in self._tools if key[0] == connection_id]:
            del self._tools[key]
        stamp = datetime.now(timezone.utc)
        stored = [
            AiMcpTool(
                connection_id=connection_id,
                discovered_at=stamp,
                **tool.model_dump(),
            )
            for tool in tools
        ]
        for tool in stored:
            self._tools[(connection_id, tool.name)] = tool
        connection = record.connection.model_copy(
            update={
                "catalog_revision": record.connection.revision,
                "last_discovered_at": stamp,
                "updated_at": stamp,
            }
        )
        self._connections[connection_id] = (
            user_id,
            connection,
            record.bearer_token_ciphertext,
        )
        return connection, stored

    async def list_tools(self, user_id: int, connection_id: str) -> list[AiMcpTool]:
        record = await self.get_connection_record(user_id, connection_id)
        if record.connection.catalog_revision != record.connection.revision:
            return []
        values = [tool for (owner_id, _name), tool in self._tools.items() if owner_id == connection_id]
        return sorted(values, key=lambda item: item.name.casefold())

    async def get_tool(
        self,
        user_id: int,
        connection_id: str,
        tool_name: str,
    ) -> AiMcpTool:
        record = await self.get_connection_record(user_id, connection_id)
        _require_current_catalog(record.connection)
        tool = self._tools.get((connection_id, tool_name))
        if tool is None:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "MCP tool not found. Discover tools before calling it.",
                status_code=404,
            )
        return tool

    async def begin_call(self, **value: Any) -> None:
        record = await self.get_connection_record(
            value["user_id"],
            value["connection_id"],
        )
        if not record.connection.enabled:
            raise AiDomainError(
                "AI_MCP_CONNECTION_DISABLED",
                "Enable this MCP connection before contacting it.",
                status_code=409,
            )
        if record.connection.revision != value["connection_revision"]:
            raise _rediscovery_required()
        _require_current_catalog(record.connection)
        if (value["connection_id"], value["tool_name"]) not in self._tools:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "MCP tool not found. Discover tools before calling it.",
                status_code=404,
            )
        self.calls.append(
            {
                **value,
                "status": "pending",
                "result_metadata": None,
                "error_code": None,
                "duration_ms": 0,
            }
        )

    async def complete_call(self, **value: Any) -> None:
        for call in self.calls:
            if call["call_id"] == value["call_id"] and call["user_id"] == value["user_id"]:
                call.update(value)
                return
        raise RuntimeError("MCP call audit record not found")


class MySqlAiMcpRepository:
    def __init__(self, db) -> None:
        self.db = db

    @staticmethod
    def _connection_record(row: dict[str, Any]) -> AiMcpConnectionRecord:
        data = dict(row)
        ciphertext = data.pop("bearer_token_ciphertext", None)
        data["enabled"] = bool(data["enabled"])
        data["has_bearer_token"] = ciphertext is not None
        data["revision"] = int(data["revision"])
        catalog_revision = data.get("catalog_revision")
        data["catalog_revision"] = (
            int(catalog_revision) if catalog_revision is not None else None
        )
        if data["catalog_revision"] != data["revision"]:
            data["last_discovered_at"] = None
        return AiMcpConnectionRecord(
            connection=AiMcpConnection(**data),
            bearer_token_ciphertext=ciphertext,
        )

    @staticmethod
    def _tool(row: dict[str, Any]) -> AiMcpTool:
        data = dict(row)
        data["input_schema"] = _load_object(data.get("input_schema"))
        data["annotations"] = _load_object(data.get("annotations"))
        return AiMcpTool(**data)

    async def list_connections(self, user_id: int) -> list[AiMcpConnection]:
        return await asyncio.to_thread(self._list_connections, user_id)

    def _list_connections(self, user_id: int) -> list[AiMcpConnection]:
        rows = self.db.fetch_all(
            "SELECT id, name, endpoint, enabled, bearer_token_ciphertext, "
            "bearer_token_hint, revision, catalog_revision, last_discovered_at, "
            "created_at, updated_at "
            "FROM ai_mcp_connections WHERE user_id = %s "
            "ORDER BY updated_at DESC, id DESC",
            (user_id,),
        )
        return [self._connection_record(row).connection for row in rows]

    async def create_connection(
        self,
        user_id: int,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
    ) -> AiMcpConnection:
        return await asyncio.to_thread(
            self._create_connection,
            user_id,
            value,
            bearer_token_ciphertext,
            bearer_token_hint,
        )

    def _create_connection(
        self,
        user_id: int,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
    ) -> AiMcpConnection:
        connection_id = _id("mcp")
        try:
            self.db.execute(
                "INSERT INTO ai_mcp_connections "
                "(id, user_id, name, endpoint, bearer_token_ciphertext, bearer_token_hint, enabled) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    connection_id,
                    user_id,
                    value.name,
                    value.endpoint,
                    bearer_token_ciphertext,
                    bearer_token_hint,
                    int(value.enabled),
                ),
            )
        except pymysql.err.IntegrityError as exc:
            raise AiDomainError(
                "AI_MCP_CONNECTION_NAME_CONFLICT",
                "An MCP connection with this name already exists.",
                status_code=409,
            ) from exc
        return self._get_connection_record(user_id, connection_id).connection

    async def get_connection_record(
        self,
        user_id: int,
        connection_id: str,
    ) -> AiMcpConnectionRecord:
        return await asyncio.to_thread(
            self._get_connection_record,
            user_id,
            connection_id,
        )

    def _get_connection_record(
        self,
        user_id: int,
        connection_id: str,
    ) -> AiMcpConnectionRecord:
        row = self.db.fetch_one(
            "SELECT id, name, endpoint, enabled, bearer_token_ciphertext, "
            "bearer_token_hint, revision, catalog_revision, last_discovered_at, "
            "created_at, updated_at "
            "FROM ai_mcp_connections WHERE id = %s AND user_id = %s",
            (connection_id, user_id),
        )
        if not row:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "MCP connection not found.",
                status_code=404,
            )
        return self._connection_record(row)

    async def update_connection(
        self,
        user_id: int,
        connection_id: str,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
        expected_revision: int,
    ) -> AiMcpConnection:
        return await asyncio.to_thread(
            self._update_connection,
            user_id,
            connection_id,
            value,
            bearer_token_ciphertext,
            bearer_token_hint,
            expected_revision,
        )

    def _update_connection(
        self,
        user_id: int,
        connection_id: str,
        value: AiMcpConnectionCreate,
        bearer_token_ciphertext: str | None,
        bearer_token_hint: str | None,
        expected_revision: int,
    ) -> AiMcpConnection:
        try:
            with self.db.unit_of_work() as uow:
                current = uow.fetch_one(
                    "SELECT endpoint, enabled, bearer_token_ciphertext, revision, "
                    "catalog_revision, last_discovered_at "
                    "FROM ai_mcp_connections WHERE id = %s AND user_id = %s FOR UPDATE",
                    (connection_id, user_id),
                )
                if not current:
                    raise AiDomainError(
                        "AI_RESOURCE_NOT_FOUND",
                        "MCP connection not found.",
                        status_code=404,
                    )
                current_revision = int(current["revision"])
                if current_revision != expected_revision:
                    raise _connection_changed()
                remote_configuration_changed = (
                    current["endpoint"] != value.endpoint
                    or bool(current["enabled"]) != value.enabled
                    or current.get("bearer_token_ciphertext")
                    != bearer_token_ciphertext
                )
                revision = current_revision + 1
                if remote_configuration_changed:
                    uow.execute(
                        "DELETE FROM ai_mcp_tools WHERE connection_id = %s",
                        (connection_id,),
                    )
                    catalog_revision = None
                    last_discovered_at = None
                else:
                    current_catalog_revision = current.get("catalog_revision")
                    catalog_revision = (
                        revision
                        if current_catalog_revision == current_revision
                        else current_catalog_revision
                    )
                    last_discovered_at = current.get("last_discovered_at")
                affected = uow.execute(
                    "UPDATE ai_mcp_connections SET name = %s, endpoint = %s, "
                    "bearer_token_ciphertext = %s, bearer_token_hint = %s, enabled = %s, "
                    "revision = %s, catalog_revision = %s, last_discovered_at = %s "
                    "WHERE id = %s AND user_id = %s AND revision = %s",
                    (
                        value.name,
                        value.endpoint,
                        bearer_token_ciphertext,
                        bearer_token_hint,
                        int(value.enabled),
                        revision,
                        catalog_revision,
                        last_discovered_at,
                        connection_id,
                        user_id,
                        current_revision,
                    ),
                )
                if affected != 1:
                    raise _connection_changed()
                uow.commit()
        except pymysql.err.IntegrityError as exc:
            raise AiDomainError(
                "AI_MCP_CONNECTION_NAME_CONFLICT",
                "An MCP connection with this name already exists.",
                status_code=409,
            ) from exc
        return self._get_connection_record(user_id, connection_id).connection

    async def delete_connection(self, user_id: int, connection_id: str) -> None:
        await asyncio.to_thread(self._delete_connection, user_id, connection_id)

    def _delete_connection(self, user_id: int, connection_id: str) -> None:
        with self.db.unit_of_work() as uow:
            owned = uow.fetch_one(
                "SELECT id FROM ai_mcp_connections WHERE id = %s AND user_id = %s FOR UPDATE",
                (connection_id, user_id),
            )
            if not owned:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "MCP connection not found.",
                    status_code=404,
                )
            uow.execute("DELETE FROM ai_mcp_tools WHERE connection_id = %s", (connection_id,))
            uow.execute(
                "DELETE FROM ai_mcp_connections WHERE id = %s AND user_id = %s",
                (connection_id, user_id),
            )
            uow.commit()

    async def replace_tools(
        self,
        user_id: int,
        connection_id: str,
        tools: list[AiMcpDiscoveredTool],
        expected_revision: int,
    ) -> tuple[AiMcpConnection, list[AiMcpTool]]:
        return await asyncio.to_thread(
            self._replace_tools,
            user_id,
            connection_id,
            tools,
            expected_revision,
        )

    def _replace_tools(
        self,
        user_id: int,
        connection_id: str,
        tools: list[AiMcpDiscoveredTool],
        expected_revision: int,
    ) -> tuple[AiMcpConnection, list[AiMcpTool]]:
        with self.db.unit_of_work() as uow:
            owned = uow.fetch_one(
                "SELECT id, enabled, revision FROM ai_mcp_connections "
                "WHERE id = %s AND user_id = %s FOR UPDATE",
                (connection_id, user_id),
            )
            if not owned:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "MCP connection not found.",
                    status_code=404,
                )
            if int(owned["revision"]) != expected_revision:
                raise _connection_changed()
            if not bool(owned["enabled"]):
                raise AiDomainError(
                    "AI_MCP_CONNECTION_DISABLED",
                    "Enable this MCP connection before contacting it.",
                    status_code=409,
                )
            uow.execute("DELETE FROM ai_mcp_tools WHERE connection_id = %s", (connection_id,))
            for tool in tools:
                uow.execute(
                    "INSERT INTO ai_mcp_tools "
                    "(connection_id, name, description, input_schema, annotations) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (
                        connection_id,
                        tool.name,
                        tool.description,
                        _json(tool.input_schema),
                        _json(tool.annotations),
                    ),
                )
            uow.execute(
                "UPDATE ai_mcp_connections SET catalog_revision = revision, "
                "last_discovered_at = CURRENT_TIMESTAMP(6) "
                "WHERE id = %s AND user_id = %s AND revision = %s",
                (connection_id, user_id, expected_revision),
            )
            uow.commit()
        connection = self._get_connection_record(user_id, connection_id).connection
        return connection, self._list_tools(user_id, connection_id)

    async def list_tools(self, user_id: int, connection_id: str) -> list[AiMcpTool]:
        return await asyncio.to_thread(self._list_tools, user_id, connection_id)

    def _list_tools(self, user_id: int, connection_id: str) -> list[AiMcpTool]:
        record = self._get_connection_record(user_id, connection_id)
        if record.connection.catalog_revision != record.connection.revision:
            return []
        rows = self.db.fetch_all(
            "SELECT t.connection_id, t.name, t.description, t.input_schema, "
            "t.annotations, t.discovered_at FROM ai_mcp_tools t "
            "JOIN ai_mcp_connections c ON c.id = t.connection_id "
            "WHERE t.connection_id = %s AND c.user_id = %s ORDER BY t.name",
            (connection_id, user_id),
        )
        return [self._tool(row) for row in rows]

    async def get_tool(
        self,
        user_id: int,
        connection_id: str,
        tool_name: str,
    ) -> AiMcpTool:
        return await asyncio.to_thread(
            self._get_tool,
            user_id,
            connection_id,
            tool_name,
        )

    def _get_tool(
        self,
        user_id: int,
        connection_id: str,
        tool_name: str,
    ) -> AiMcpTool:
        record = self._get_connection_record(user_id, connection_id)
        _require_current_catalog(record.connection)
        row = self.db.fetch_one(
            "SELECT t.connection_id, t.name, t.description, t.input_schema, "
            "t.annotations, t.discovered_at FROM ai_mcp_tools t "
            "JOIN ai_mcp_connections c ON c.id = t.connection_id "
            "WHERE t.connection_id = %s AND t.name = %s AND c.user_id = %s",
            (connection_id, tool_name, user_id),
        )
        if not row:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "MCP tool not found. Discover tools before calling it.",
                status_code=404,
            )
        return self._tool(row)

    async def begin_call(
        self,
        *,
        call_id: str,
        user_id: int,
        connection_id: str,
        tool_name: str,
        argument_keys: list[str],
        connection_revision: int,
    ) -> None:
        await asyncio.to_thread(
            self._begin_call,
            call_id=call_id,
            user_id=user_id,
            connection_id=connection_id,
            tool_name=tool_name,
            argument_keys=argument_keys,
            connection_revision=connection_revision,
        )

    def _begin_call(
        self,
        *,
        call_id: str,
        user_id: int,
        connection_id: str,
        tool_name: str,
        argument_keys: list[str],
        connection_revision: int,
    ) -> None:
        with self.db.unit_of_work() as uow:
            current = uow.fetch_one(
                "SELECT enabled, revision, catalog_revision FROM ai_mcp_connections "
                "WHERE id = %s AND user_id = %s FOR UPDATE",
                (connection_id, user_id),
            )
            if not current:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "MCP connection not found.",
                    status_code=404,
                )
            if not bool(current["enabled"]):
                raise AiDomainError(
                    "AI_MCP_CONNECTION_DISABLED",
                    "Enable this MCP connection before contacting it.",
                    status_code=409,
                )
            revision = int(current["revision"])
            if revision != connection_revision or current.get("catalog_revision") != revision:
                raise _rediscovery_required()
            tool = uow.fetch_one(
                "SELECT name FROM ai_mcp_tools WHERE connection_id = %s AND name = %s",
                (connection_id, tool_name),
            )
            if not tool:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "MCP tool not found. Discover tools before calling it.",
                    status_code=404,
                )
            uow.execute(
                "INSERT INTO ai_mcp_tool_calls "
                "(id, user_id, connection_id, connection_revision, tool_name, status, "
                "argument_keys, result_metadata, error_code, duration_ms, completed_at) "
                "VALUES (%s, %s, %s, %s, %s, 'pending', %s, NULL, NULL, 0, NULL)",
                (
                    call_id,
                    user_id,
                    connection_id,
                    connection_revision,
                    tool_name,
                    _json(argument_keys),
                ),
            )
            uow.commit()

    async def complete_call(
        self,
        *,
        call_id: str,
        user_id: int,
        status: AiMcpCallTerminalStatus,
        result_metadata: dict[str, Any] | None,
        error_code: str | None,
        duration_ms: int,
    ) -> None:
        await asyncio.to_thread(
            self._complete_call,
            call_id=call_id,
            user_id=user_id,
            status=status,
            result_metadata=result_metadata,
            error_code=error_code,
            duration_ms=duration_ms,
        )

    def _complete_call(
        self,
        *,
        call_id: str,
        user_id: int,
        status: AiMcpCallTerminalStatus,
        result_metadata: dict[str, Any] | None,
        error_code: str | None,
        duration_ms: int,
    ) -> None:
        affected = self.db.execute(
            "UPDATE ai_mcp_tool_calls SET status = %s, result_metadata = %s, "
            "error_code = %s, duration_ms = %s, completed_at = CURRENT_TIMESTAMP(6) "
            "WHERE id = %s AND user_id = %s AND status = 'pending'",
            (
                status,
                _json(result_metadata) if result_metadata is not None else None,
                error_code,
                duration_ms,
                call_id,
                user_id,
            ),
        )
        if affected != 1:
            raise RuntimeError("MCP call audit record was not pending")

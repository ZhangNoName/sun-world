"""Static module declarations. Composition roots supply business manifests explicitly."""

from dataclasses import asdict, dataclass
import re
from types import MappingProxyType
from typing import Mapping

from pydantic import BaseModel


@dataclass(frozen=True)
class ModuleDependency:
    module_id: str
    version: str


@dataclass(frozen=True)
class HttpEntry:
    method: str
    path: str


@dataclass(frozen=True)
class ToolManifest:
    id: str
    version: str
    module_id: str
    model_name: str
    capability: str
    effect: str
    data_class: str
    confirmation: str
    input_schema_ref: str
    output_schema_ref: str


@dataclass(frozen=True)
class ModuleManifest:
    id: str
    version: str
    owner: str
    dependencies: tuple[ModuleDependency, ...] = ()
    capabilities: tuple[str, ...] = ()
    http_entries: tuple[HttpEntry, ...] = ()
    tools: tuple[ToolManifest, ...] = ()
    skills: tuple[str, ...] = ()
    data_owners: tuple[str, ...] = ()


class ModuleRegistry:
    def __init__(
        self,
        modules: tuple[ModuleManifest, ...],
        schemas: Mapping[str, type[BaseModel]],
    ):
        module_map: dict[str, ModuleManifest] = {}
        tools: dict[str, ToolManifest] = {}
        model_names: dict[str, str] = {}
        capabilities: set[str] = set()
        entries: set[tuple[str, str]] = set()
        for module in modules:
            if not module.id or not module.version or not module.owner:
                raise ValueError("module id, version and owner are required")
            if module.id in module_map:
                raise ValueError(f"duplicate module: {module.id}")
            module_map[module.id] = module
            for capability in module.capabilities:
                if not capability or capability in capabilities:
                    raise ValueError(f"duplicate or empty capability: {capability}")
                capabilities.add(capability)
            for entry in module.http_entries:
                # Parameter spelling cannot distinguish two HTTP route owners.
                route_shape = re.sub(r"\{[^{}]+\}", "{}", entry.path)
                key = (entry.method.upper(), route_shape)
                if (
                    key[0] not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
                    or not entry.path.startswith("/")
                    or key in entries
                ):
                    raise ValueError(f"invalid or duplicate HTTP entry: {key}")
                entries.add(key)
            for tool in module.tools:
                if tool.module_id != module.id:
                    raise ValueError(f"tool owner mismatch: {tool.id}")
                if not tool.id or tool.id in tools:
                    raise ValueError(f"duplicate or empty tool: {tool.id}")
                if not tool.model_name or tool.model_name in model_names:
                    raise ValueError(f"duplicate or empty model name: {tool.model_name}")
                if not tool.version or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", tool.model_name):
                    raise ValueError(f"invalid tool version or model name: {tool.id}")
                if tool.capability not in module.capabilities:
                    raise ValueError(f"unregistered tool capability: {tool.capability}")
                for ref in (tool.input_schema_ref, tool.output_schema_ref):
                    schema = schemas.get(ref)
                    if not isinstance(schema, type) or not issubclass(schema, BaseModel):
                        raise ValueError(f"unknown schema: {ref}")
                    if schema.__name__ != ref:
                        raise ValueError(f"schema name mismatch: {ref}")
                input_schema = schemas[tool.input_schema_ref]
                if input_schema.model_config.get("extra") != "forbid":
                    raise ValueError(f"tool input must reject unknown fields: {tool.id}")
                if not input_schema.model_config.get("strict"):
                    raise ValueError(f"tool input must use strict validation: {tool.id}")
                reserved = {
                    "user_id", "owner", "owner_user_id", "run_id", "generation", "role",
                    "roles", "principal", "lease", "token", "credentials", "api_url",
                }
                if reserved.intersection(input_schema.model_fields):
                    raise ValueError(f"tool input declares execution identity: {tool.id}")
                tools[tool.id] = tool
                model_names[tool.model_name] = tool.id

        visited: set[str] = set()
        active: set[str] = set()

        def visit(module_id: str) -> None:
            if module_id in active:
                raise ValueError(f"module dependency cycle: {module_id}")
            if module_id in visited:
                return
            active.add(module_id)
            dependency_ids: set[str] = set()
            for dependency in module_map[module_id].dependencies:
                if dependency.module_id in dependency_ids:
                    raise ValueError(f"duplicate dependency: {dependency.module_id}")
                dependency_ids.add(dependency.module_id)
                target = module_map.get(dependency.module_id)
                if target is None or target.version != dependency.version:
                    raise ValueError(f"missing or incompatible dependency: {dependency.module_id}")
                visit(dependency.module_id)
            active.remove(module_id)
            visited.add(module_id)

        for module_id in module_map:
            visit(module_id)
        self.modules = MappingProxyType(module_map)
        self.tools = MappingProxyType(tools)
        self.model_names = MappingProxyType(model_names)
        self.capabilities = frozenset(capabilities)
        self.schemas = MappingProxyType(dict(schemas))

    def export(self) -> dict:
        used_schemas = {
            ref
            for tool in self.tools.values()
            for ref in (tool.input_schema_ref, tool.output_schema_ref)
        }
        return {
            "protocol_version": "1",
            "modules": [asdict(self.modules[key]) for key in sorted(self.modules)],
            "schemas": {
                ref: self.schemas[ref].model_json_schema() for ref in sorted(used_schemas)
            },
        }

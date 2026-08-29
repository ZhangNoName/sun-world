"""Conservative MySQL schema migration for the Sun World API.

The migrator is intentionally narrow:
- create missing application tables,
- add missing application columns,
- reject incompatible existing column types,
- never drop, rename, or rewrite existing columns.

Run without database access:
    python -m src.database.mysql.schema_migration --mode check

Run on the server with production environment/config:
    python -m src.database.mysql.schema_migration --mode apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable


MYSQL_SCHEMA: dict[str, dict[str, Any]] = {
    "users": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "username", "definition": "VARCHAR(128) NULL", "type": "varchar"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "sex", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "age", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "phone", "definition": "VARCHAR(64) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "email", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "password", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "birth_day", "definition": "DATE NULL", "type": "date"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "status", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_users_email` (`email`)",
            "UNIQUE KEY `idx_users_username` (`username`)",
        ],
    },
    "auth_identities": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "provider", "definition": "VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL", "type": "varchar"},
            {"name": "issuer", "definition": "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL", "type": "varchar"},
            {"name": "subject", "definition": "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL", "type": "varchar"},
            {"name": "display_name", "definition": "VARCHAR(255) NULL", "type": "varchar"},
            {"name": "avatar_url", "definition": "VARCHAR(2048) NULL", "type": "varchar"},
            {"name": "profile_json", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "linked_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "last_authenticated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "status", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_auth_identities_subject` (`provider`, `issuer`, `subject`)",
            "KEY `idx_auth_identities_user_status` (`user_id`, `status`)",
        ],
    },
    "auth_verified_contacts": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "kind", "definition": "VARCHAR(16) NOT NULL", "type": "varchar"},
            {"name": "normalized_value", "definition": "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL", "type": "varchar"},
            {"name": "display_value", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "verification_source", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "verified_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_auth_contacts_kind_value` (`kind`, `normalized_value`)",
            "KEY `idx_auth_contacts_user_kind` (`user_id`, `kind`)",
        ],
    },
    "auth_security_events": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NULL", "type": "int"},
            {"name": "event_type", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "provider", "definition": "VARCHAR(32) NULL", "type": "varchar"},
            {"name": "outcome", "definition": "VARCHAR(32) NOT NULL", "type": "varchar"},
            {"name": "metadata_json", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "KEY `idx_auth_events_user_created` (`user_id`, `created_at`)",
            "KEY `idx_auth_events_type_created` (`event_type`, `created_at`)",
        ],
    },
    "roles": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_roles_code` (`code`)"],
    },
    "resources": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "type", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "path", "definition": "VARCHAR(500) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_resources_code` (`code`)"],
    },
    "user_roles": {
        "columns": [
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "role_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["user_id", "role_id"],
        "indexes": ["KEY `idx_user_roles_role_id` (`role_id`)"],
    },
    "role_resources": {
        "columns": [
            {"name": "role_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "resource_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["role_id", "resource_id"],
        "indexes": ["KEY `idx_role_resources_resource_id` (`resource_id`)"],
    },
    "tag": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_tag_name` (`name`)"],
    },
    "category": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_category_name` (`name`)"],
    },
    "blog": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "title", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "author", "definition": "VARCHAR(255) NULL", "type": "varchar"},
            {"name": "abstract", "definition": "VARCHAR(1000) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "category", "definition": "INT NULL", "type": "int"},
            {"name": "created_at", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "is_deleted", "definition": "TINYINT(1) NOT NULL DEFAULT 0", "type": "tinyint"},
            {"name": "view_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "comment_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "byte_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_blog_category` (`category`)"],
    },
    "blog_tag": {
        "columns": [
            {"name": "blog_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "tag_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["blog_id", "tag_id"],
        "indexes": ["KEY `idx_blog_tag_tag_id` (`tag_id`)"],
    },
    "dictionary_types": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
            {"name": "is_enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_dictionary_types_code` (`code`)",
            "KEY `idx_dictionary_types_enabled` (`is_enabled`, `code`)",
        ],
    },
    "dictionary_items": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "dictionary_type_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "value", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "label", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "color", "definition": "VARCHAR(32) NULL", "type": "varchar"},
            {"name": "sort_order", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "is_enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
            {"name": "extension_json", "definition": "JSON NULL", "type": "json"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_dictionary_items_type_value` (`dictionary_type_id`, `value`)",
            "KEY `idx_dictionary_items_enabled_order` (`dictionary_type_id`, `is_enabled`, `sort_order`, `id`)",
        ],
        "constraints": [
            "CONSTRAINT `fk_dictionary_items_type` FOREIGN KEY (`dictionary_type_id`) REFERENCES `dictionary_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
        ],
    },
    "ai_personas": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "name", "definition": "VARCHAR(120) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(1000) NULL", "type": "varchar"},
            {"name": "instructions", "definition": "MEDIUMTEXT NOT NULL", "type": "varchar"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_ai_personas_user_updated` (`user_id`, `updated_at`)"],
    },
    "ai_skills": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "name", "definition": "VARCHAR(120) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(1000) NULL", "type": "varchar"},
            {"name": "kind", "definition": "VARCHAR(16) NOT NULL DEFAULT 'prompt'", "type": "varchar"},
            {"name": "instructions", "definition": "MEDIUMTEXT NOT NULL", "type": "varchar"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_ai_skills_user_updated` (`user_id`, `updated_at`)"],
    },
    "ai_mcp_connections": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "name", "definition": "VARCHAR(120) NOT NULL", "type": "varchar"},
            {"name": "endpoint", "definition": "VARCHAR(2048) NOT NULL", "type": "varchar"},
            {"name": "bearer_token_ciphertext", "definition": "TEXT NULL", "type": "varchar"},
            {"name": "bearer_token_hint", "definition": "VARCHAR(32) NULL", "type": "varchar"},
            {"name": "enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
            {"name": "revision", "definition": "BIGINT NOT NULL DEFAULT 1", "type": "int"},
            {"name": "catalog_revision", "definition": "BIGINT NULL", "type": "int"},
            {"name": "last_discovered_at", "definition": "DATETIME(6) NULL", "type": "datetime"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_ai_mcp_connections_user_name` (`user_id`, `name`)",
            "KEY `idx_ai_mcp_connections_user_enabled` (`user_id`, `enabled`, `updated_at`)",
        ],
    },
    "ai_mcp_tools": {
        "columns": [
            {"name": "connection_id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "name", "definition": "VARCHAR(256) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "TEXT NULL", "type": "varchar"},
            {"name": "input_schema", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "annotations", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "discovered_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["connection_id", "name"],
        "indexes": [],
    },
    "ai_mcp_tool_calls": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "connection_id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "connection_revision", "definition": "BIGINT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "tool_name", "definition": "VARCHAR(256) NOT NULL", "type": "varchar"},
            {"name": "status", "definition": "VARCHAR(16) NOT NULL", "type": "varchar"},
            {"name": "argument_keys", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "result_metadata", "definition": "JSON NULL", "type": "json"},
            {"name": "error_code", "definition": "VARCHAR(64) NULL", "type": "varchar"},
            {"name": "duration_ms", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "completed_at", "definition": "DATETIME(6) NULL", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "KEY `idx_ai_mcp_calls_user_created` (`user_id`, `created_at`)",
            "KEY `idx_ai_mcp_calls_connection_created` (`connection_id`, `created_at`)",
        ],
    },
    "ai_provider_profiles": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "provider", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "name", "definition": "VARCHAR(120) NOT NULL", "type": "varchar"},
            {"name": "base_url", "definition": "VARCHAR(2048) NOT NULL", "type": "varchar"},
            {"name": "model", "definition": "VARCHAR(200) NOT NULL", "type": "varchar"},
            {"name": "api_key_ciphertext", "definition": "TEXT NULL", "type": "varchar"},
            {"name": "api_key_hint", "definition": "VARCHAR(32) NULL", "type": "varchar"},
            {"name": "is_default", "definition": "TINYINT(1) NOT NULL DEFAULT 0", "type": "tinyint"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "KEY `idx_ai_provider_profiles_user` (`user_id`, `updated_at`)",
            "KEY `idx_ai_provider_profiles_default` (`user_id`, `is_default`)",
        ],
    },
    "ai_provider_catalog": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "name", "definition": "VARCHAR(120) NOT NULL", "type": "varchar"},
            {"name": "default_base_url", "definition": "VARCHAR(2048) NULL", "type": "varchar"},
            {"name": "default_model", "definition": "VARCHAR(200) NULL", "type": "varchar"},
            {"name": "api_key_ciphertext", "definition": "TEXT NULL", "type": "varchar"},
            {"name": "api_key_hint", "definition": "VARCHAR(32) NULL", "type": "varchar"},
            {"name": "is_enabled", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
            {"name": "sort_order", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_ai_provider_catalog_enabled_sort` (`is_enabled`, `sort_order`)"],
    },
    "ai_conversations": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "title", "definition": "VARCHAR(500) NOT NULL", "type": "varchar"},
            {"name": "is_deleted", "definition": "TINYINT(1) NOT NULL DEFAULT 0", "type": "tinyint"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_ai_conversations_user_updated` (`user_id`, `is_deleted`, `updated_at`)"],
    },
    "ai_messages": {
        "columns": [
            {"name": "id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "conversation_id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "role", "definition": "VARCHAR(32) NOT NULL", "type": "varchar"},
            {"name": "blocks", "definition": "JSON NOT NULL", "type": "json"},
            {"name": "sequence", "definition": "INT NOT NULL", "type": "int"},
            {"name": "status", "definition": "VARCHAR(32) NOT NULL DEFAULT 'completed'", "type": "varchar"},
            {"name": "parent_message_id", "definition": "VARCHAR(64) NULL", "type": "varchar"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": [
            "UNIQUE KEY `idx_ai_messages_sequence` (`conversation_id`, `sequence`)",
            "KEY `idx_ai_messages_parent` (`parent_message_id`)",
        ],
    },
    "ai_message_feedback": {
        "columns": [
            {"name": "message_id", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "value", "definition": "VARCHAR(16) NOT NULL", "type": "varchar"},
            {"name": "created_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)", "type": "datetime"},
        ],
        "primary_key": ["message_id", "user_id"],
        "indexes": ["KEY `idx_ai_message_feedback_user` (`user_id`, `updated_at`)"],
    },
}

IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
INDEX_DEFINITION_RE = re.compile(
    r"^(?P<unique>UNIQUE\s+)?KEY\s+`(?P<name>[^`]+)`\s*\((?P<columns>.+)\)$",
    re.IGNORECASE,
)
FOREIGN_KEY_DEFINITION_RE = re.compile(
    r"^CONSTRAINT\s+`(?P<name>[^`]+)`\s+FOREIGN\s+KEY\s*"
    r"\((?P<columns>.+?)\)\s+REFERENCES\s+`(?P<table>[^`]+)`\s*"
    r"\((?P<referenced_columns>.+?)\)\s+ON\s+DELETE\s+"
    r"(?P<delete_rule>RESTRICT|CASCADE|SET\s+NULL|NO\s+ACTION)\s+ON\s+UPDATE\s+"
    r"(?P<update_rule>RESTRICT|CASCADE|SET\s+NULL|NO\s+ACTION)$",
    re.IGNORECASE,
)
COLUMN_DEFINITION_RE = re.compile(
    r"^\s*(?P<data_type>[A-Za-z]+)(?:\((?P<size>\d+)\))?(?=\s|$)",
    re.IGNORECASE,
)
QUOTED_COLUMN_RE = re.compile(r"`([^`]+)`")
LEGACY_COMPATIBLE_COLUMN_TYPES = {
    ("resources", "type"): {"tinyint"},
    ("blog", "category"): {"varchar"},
}


def api_root() -> Path:
    current_file = Path(__file__).resolve()
    for parent in current_file.parents:
        if (parent / "src" / "conf").is_dir() and (parent / "main.py").is_file():
            return parent
    raise FileNotFoundError(f"Unable to locate API root from {current_file}")


def repo_root() -> Path:
    root = api_root()
    if root.name == "api" and root.parent.name == "apps":
        return root.parent.parent
    return root


def quote_identifier(identifier: str) -> str:
    if not IDENTIFIER_RE.match(identifier):
        raise ValueError(f"Unsafe MySQL identifier: {identifier}")
    return f"`{identifier}`"


def expected_column_names(table_schema: dict[str, Any]) -> list[str]:
    return [column["name"] for column in table_schema["columns"]]


def parse_index_definition(definition: str) -> dict[str, Any]:
    match = INDEX_DEFINITION_RE.fullmatch(str(definition).strip())
    if match is None:
        raise ValueError(f"Invalid MySQL index definition: {definition}")
    columns = QUOTED_COLUMN_RE.findall(match.group("columns"))
    if not columns:
        raise ValueError(f"Index has no columns: {definition}")
    return {
        "name": match.group("name"),
        "unique": bool(match.group("unique")),
        "columns": columns,
    }


def parse_foreign_key_definition(definition: str) -> dict[str, Any]:
    match = FOREIGN_KEY_DEFINITION_RE.fullmatch(str(definition).strip())
    if match is None:
        raise ValueError(f"Invalid MySQL foreign key definition: {definition}")
    columns = QUOTED_COLUMN_RE.findall(match.group("columns"))
    referenced_columns = QUOTED_COLUMN_RE.findall(
        match.group("referenced_columns")
    )
    if not columns or len(columns) != len(referenced_columns):
        raise ValueError(f"Invalid MySQL foreign key columns: {definition}")
    return {
        "name": match.group("name"),
        "columns": columns,
        "referenced_table": match.group("table"),
        "referenced_columns": referenced_columns,
        "delete_rule": re.sub(r"\s+", " ", match.group("delete_rule").upper()),
        "update_rule": re.sub(r"\s+", " ", match.group("update_rule").upper()),
    }


def expected_column_contract(column: dict[str, Any]) -> dict[str, Any]:
    definition = str(column["definition"]).strip()
    match = COLUMN_DEFINITION_RE.match(definition)
    if match is None:
        raise ValueError(f"Invalid MySQL column definition: {definition}")
    data_type = match.group("data_type").lower()
    size = int(match.group("size")) if match.group("size") else None
    upper = definition.upper()
    if " NOT NULL" in f" {upper}":
        nullable = False
    elif re.search(r"(?:^|\s)NULL(?:\s|$)", upper):
        nullable = True
    else:
        raise ValueError(f"Column definition must declare NULL or NOT NULL: {definition}")
    default_match = re.search(
        r"\bDEFAULT\s+(CURRENT_TIMESTAMP(?:\(\d+\))?|NULL|'[^']*'|-?\d+(?:\.\d+)?)",
        definition,
        re.IGNORECASE,
    )
    on_update_match = re.search(
        r"\bON\s+UPDATE\s+(CURRENT_TIMESTAMP(?:\(\d+\))?)",
        definition,
        re.IGNORECASE,
    )
    return {
        "data_type": data_type,
        "character_maximum_length": size if data_type in {"char", "varchar"} else None,
        "datetime_precision": size if data_type in {"datetime", "timestamp", "time"} else None,
        "collation": (
            collation.group(1).lower()
            if (collation := re.search(r"\bCOLLATE\s+([A-Za-z0-9_]+)", definition, re.IGNORECASE))
            else None
        ),
        "nullable": nullable,
        "auto_increment": "AUTO_INCREMENT" in upper,
        "default": _normalize_column_default(
            default_match.group(1) if default_match else None
        ),
        "on_update": _normalize_temporal_expression(
            on_update_match.group(1) if on_update_match else None
        ),
    }


def _normalize_temporal_expression(value: object) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", "", str(value)).upper()
    if normalized in {"CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP()"}:
        return "CURRENT_TIMESTAMP"
    match = re.fullmatch(r"CURRENT_TIMESTAMP\((\d+)\)", normalized)
    if match:
        return f"CURRENT_TIMESTAMP({int(match.group(1))})"
    return normalized


def _normalize_column_default(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if normalized.upper() == "NULL":
        return None
    temporal = _normalize_temporal_expression(normalized)
    if temporal and temporal.startswith("CURRENT_TIMESTAMP"):
        return temporal
    if len(normalized) >= 2 and normalized[0] == normalized[-1] == "'":
        return normalized[1:-1].replace("''", "'")
    return normalized


def validate_contract(schema: dict[str, dict[str, Any]] = MYSQL_SCHEMA) -> list[str]:
    errors: list[str] = []
    for table_name, table_schema in schema.items():
        try:
            quote_identifier(table_name)
        except ValueError as exc:
            errors.append(str(exc))

        seen_columns: set[str] = set()
        for column in table_schema.get("columns", []):
            name = column.get("name")
            definition = column.get("definition")
            expected_type = column.get("type")
            if not name or not definition or not expected_type:
                errors.append(f"{table_name} has an incomplete column spec: {column!r}")
                continue
            if name in seen_columns:
                errors.append(f"{table_name} declares duplicate column: {name}")
            seen_columns.add(name)
            try:
                quote_identifier(name)
            except ValueError as exc:
                errors.append(str(exc))
            try:
                expected_column_contract(column)
            except ValueError as exc:
                errors.append(f"{table_name}.{name}: {exc}")

        primary_key = table_schema.get("primary_key", [])
        for column_name in primary_key:
            if column_name not in seen_columns:
                errors.append(f"{table_name} primary key references missing column: {column_name}")
        seen_indexes: set[str] = set()
        for definition in table_schema.get("indexes", []):
            try:
                index = parse_index_definition(definition)
            except ValueError as exc:
                errors.append(f"{table_name}: {exc}")
                continue
            if index["name"] in seen_indexes:
                errors.append(f"{table_name} declares duplicate index: {index['name']}")
            seen_indexes.add(index["name"])
            try:
                quote_identifier(index["name"])
            except ValueError as exc:
                errors.append(str(exc))
            for column_name in index["columns"]:
                if column_name not in seen_columns:
                    errors.append(
                        f"{table_name} index {index['name']} references missing column: "
                        f"{column_name}"
                    )
        seen_constraints: set[str] = set()
        for definition in table_schema.get("constraints", []):
            try:
                constraint = parse_foreign_key_definition(definition)
            except ValueError as exc:
                errors.append(f"{table_name}: {exc}")
                continue
            if constraint["name"] in seen_constraints:
                errors.append(
                    f"{table_name} declares duplicate constraint: {constraint['name']}"
                )
            seen_constraints.add(constraint["name"])
            for column_name in constraint["columns"]:
                if column_name not in seen_columns:
                    errors.append(
                        f"{table_name} constraint {constraint['name']} references missing "
                        f"column: {column_name}"
                    )
            referenced_schema = schema.get(constraint["referenced_table"])
            referenced_names = (
                set(expected_column_names(referenced_schema))
                if referenced_schema is not None
                else set()
            )
            if referenced_schema is None:
                errors.append(
                    f"{table_name} constraint {constraint['name']} references unknown table: "
                    f"{constraint['referenced_table']}"
                )
            for column_name in constraint["referenced_columns"]:
                if referenced_schema is not None and column_name not in referenced_names:
                    errors.append(
                        f"{table_name} constraint {constraint['name']} references missing "
                        f"column: {constraint['referenced_table']}.{column_name}"
                    )
    return errors


def normalize_column_type(column_type: str) -> str:
    normalized = column_type.lower().split("(", 1)[0].strip()
    for qualifier in (" unsigned", " zerofill"):
        normalized = normalized.replace(qualifier, "")
    return normalized.strip()


def column_type_matches(actual_type: str, expected_type: str) -> bool:
    normalized = normalize_column_type(actual_type)
    aliases = {
        "int": {"int", "integer", "mediumint", "bigint"},
        "tinyint": {"tinyint"},
        "varchar": {"varchar", "char", "text", "mediumtext", "longtext"},
        "datetime": {"datetime", "timestamp"},
        "date": {"date", "datetime", "timestamp"},
        "json": {"json"},
    }
    return normalized in aliases.get(expected_type, {expected_type})


def legacy_column_type_matches(table_name: str, column_name: str, actual_type: str) -> bool:
    normalized = normalize_column_type(actual_type)
    return normalized in LEGACY_COMPATIBLE_COLUMN_TYPES.get((table_name, column_name), set())


def build_create_table_sql(table_name: str, table_schema: dict[str, Any]) -> str:
    lines = [
        f"{quote_identifier(column['name'])} {column['definition']}"
        for column in table_schema["columns"]
    ]
    primary_key = table_schema.get("primary_key", [])
    if primary_key:
        key_columns = ", ".join(quote_identifier(column) for column in primary_key)
        lines.append(f"PRIMARY KEY ({key_columns})")
    lines.extend(table_schema.get("indexes", []))
    lines.extend(table_schema.get("constraints", []))
    body = ",\n  ".join(lines)
    return (
        f"CREATE TABLE IF NOT EXISTS {quote_identifier(table_name)} (\n"
        f"  {body}\n"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    )


def build_add_column_sql(table_name: str, column: dict[str, str]) -> str:
    return (
        f"ALTER TABLE {quote_identifier(table_name)} "
        f"ADD COLUMN {quote_identifier(column['name'])} {column['definition']}"
    )


def fetch_existing_tables(connection: Any, database: str) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
            """,
            (database,),
        )
        return {row["TABLE_NAME"] for row in cursor.fetchall()}


def fetch_existing_columns(connection: Any, database: str, table_name: str) -> dict[str, dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE,
                   CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, COLLATION_NAME,
                   COLUMN_DEFAULT, EXTRA
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """,
            (database, table_name),
        )
        return {row["COLUMN_NAME"]: row for row in cursor.fetchall()}


def fetch_existing_indexes(
    connection: Any,
    database: str,
    table_name: str,
) -> dict[str, dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
            """,
            (database, table_name),
        )
        indexes: dict[str, dict[str, Any]] = {}
        for row in cursor.fetchall():
            name = row["INDEX_NAME"]
            index = indexes.setdefault(
                name,
                {"unique": not bool(row["NON_UNIQUE"]), "columns": []},
            )
            index["columns"].append((row["COLUMN_NAME"], row.get("SUB_PART")))
        return indexes


def fetch_existing_foreign_keys(
    connection: Any,
    database: str,
    table_name: str,
) -> dict[str, dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT k.CONSTRAINT_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION,
                   k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
                   r.DELETE_RULE, r.UPDATE_RULE
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
            INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
              ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
             AND r.TABLE_NAME = k.TABLE_NAME
             AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
            WHERE k.CONSTRAINT_SCHEMA = %s AND k.TABLE_NAME = %s
              AND k.REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION
            """,
            (database, table_name),
        )
        constraints: dict[str, dict[str, Any]] = {}
        for row in cursor.fetchall():
            name = row["CONSTRAINT_NAME"]
            constraint = constraints.setdefault(
                name,
                {
                    "columns": [],
                    "referenced_table": row["REFERENCED_TABLE_NAME"],
                    "referenced_columns": [],
                    "delete_rule": str(row["DELETE_RULE"]).upper(),
                    "update_rule": str(row["UPDATE_RULE"]).upper(),
                },
            )
            constraint["columns"].append(row["COLUMN_NAME"])
            constraint["referenced_columns"].append(row["REFERENCED_COLUMN_NAME"])
        return constraints


def fetch_ambiguous_username_count(connection: Any, database: str) -> int:
    """Count historical usernames outside the canonical login namespace."""
    compact = (
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(username, ' ', ''), '(', ''), "
        "')', ''), '-', ''), '.', '')"
    )
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM users
            WHERE username IS NOT NULL AND username <> ''
              AND (
                username LIKE '%@%'
                OR CHAR_LENGTH(username) > 64
                OR username NOT REGEXP '^[A-Za-z0-9_.一-鿿-]+$'
                OR {compact} REGEXP '^1[3-9][0-9]{{9}}$'
                OR {compact} REGEXP '^\\+[1-9][0-9]{{7,14}}$'
                OR {compact} REGEXP '^00[1-9][0-9]{{7,14}}$'
              )
            """
        )
        row = cursor.fetchone() or {}
        return int(row.get("total", 0))


def _validate_column_contract(
    table_name: str,
    column: dict[str, Any],
    actual: dict[str, Any],
) -> list[str]:
    expected = expected_column_contract(column)
    errors: list[str] = []
    actual_data_type = str(actual.get("DATA_TYPE") or actual.get("COLUMN_TYPE") or "")
    actual_base_type = normalize_column_type(actual_data_type)
    if actual_base_type != expected["data_type"]:
        if not legacy_column_type_matches(table_name, column["name"], actual_data_type):
            errors.append(
                f"{table_name}.{column['name']} has type {actual.get('COLUMN_TYPE')}, "
                f"expected {expected['data_type']}"
            )
            return errors
    expected_length = expected["character_maximum_length"]
    actual_length = actual.get("CHARACTER_MAXIMUM_LENGTH")
    if expected_length is not None and int(actual_length or 0) != expected_length:
        errors.append(
            f"{table_name}.{column['name']} has length {actual_length}, "
            f"expected {expected_length}"
        )
    expected_precision = expected["datetime_precision"]
    actual_precision = actual.get("DATETIME_PRECISION")
    if expected_precision is not None and int(actual_precision or 0) != expected_precision:
        errors.append(
            f"{table_name}.{column['name']} has datetime precision {actual_precision}, "
            f"expected {expected_precision}"
        )
    expected_collation = expected["collation"]
    actual_collation = str(actual.get("COLLATION_NAME") or "").lower() or None
    if expected_collation is not None and actual_collation != expected_collation:
        errors.append(
            f"{table_name}.{column['name']} collation is {actual_collation}, "
            f"expected {expected_collation}"
        )
    actual_nullable = str(actual.get("IS_NULLABLE", "")).upper() == "YES"
    if actual_nullable != expected["nullable"]:
        errors.append(
            f"{table_name}.{column['name']} nullability is "
            f"{'NULL' if actual_nullable else 'NOT NULL'}, expected "
            f"{'NULL' if expected['nullable'] else 'NOT NULL'}"
        )
    actual_auto_increment = "auto_increment" in str(actual.get("EXTRA", "")).lower()
    if actual_auto_increment != expected["auto_increment"]:
        errors.append(
            f"{table_name}.{column['name']} auto_increment is "
            f"{actual_auto_increment}, expected {expected['auto_increment']}"
        )
    actual_default = _normalize_column_default(actual.get("COLUMN_DEFAULT"))
    if actual_default != expected["default"]:
        errors.append(
            f"{table_name}.{column['name']} default is {actual_default!r}, "
            f"expected {expected['default']!r}"
        )
    actual_on_update_match = re.search(
        r"\bon\s+update\s+(current_timestamp(?:\(\d+\))?)",
        str(actual.get("EXTRA", "")),
        re.IGNORECASE,
    )
    actual_on_update = _normalize_temporal_expression(
        actual_on_update_match.group(1) if actual_on_update_match else None
    )
    if actual_on_update != expected["on_update"]:
        errors.append(
            f"{table_name}.{column['name']} ON UPDATE is {actual_on_update!r}, "
            f"expected {expected['on_update']!r}"
        )
    return errors


def _validate_indexes(
    table_name: str,
    table_schema: dict[str, Any],
    actual_indexes: dict[str, dict[str, Any]],
) -> list[str]:
    expected_indexes = {
        "PRIMARY": {
            "unique": True,
            "columns": list(table_schema.get("primary_key", [])),
        }
    }
    expected_indexes.update(
        {
            index["name"]: index
            for index in (
                parse_index_definition(item)
                for item in table_schema.get("indexes", [])
            )
        }
    )
    if not expected_indexes["PRIMARY"]["columns"]:
        expected_indexes.pop("PRIMARY")
    errors: list[str] = []
    for name, expected in expected_indexes.items():
        actual = actual_indexes.get(name)
        if actual is None:
            errors.append(f"{table_name} is missing required index {name}")
            continue
        actual_columns = [column for column, _sub_part in actual["columns"]]
        prefix_columns = [
            column for column, sub_part in actual["columns"] if sub_part is not None
        ]
        if actual_columns != expected["columns"] or prefix_columns:
            errors.append(
                f"{table_name}.{name} has columns {actual_columns}, expected "
                f"{expected['columns']} without prefix lengths"
            )
        if bool(actual["unique"]) != bool(expected["unique"]):
            errors.append(
                f"{table_name}.{name} uniqueness is {actual['unique']}, "
                f"expected {expected['unique']}"
            )
    return errors


def _validate_foreign_keys(
    table_name: str,
    table_schema: dict[str, Any],
    actual_constraints: dict[str, dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    for definition in table_schema.get("constraints", []):
        expected = parse_foreign_key_definition(definition)
        actual = actual_constraints.get(expected["name"])
        if actual is None:
            errors.append(
                f"{table_name} is missing required foreign key {expected['name']}"
            )
            continue
        for key in (
            "columns",
            "referenced_table",
            "referenced_columns",
            "delete_rule",
            "update_rule",
        ):
            if actual[key] != expected[key]:
                errors.append(
                    f"{table_name}.{expected['name']} {key} is {actual[key]!r}, "
                    f"expected {expected[key]!r}"
                )
    return errors


def build_plan(
    connection: Any,
    database: str,
    schema: dict[str, dict[str, Any]] = MYSQL_SCHEMA,
) -> tuple[list[str], list[str]]:
    actions: list[str] = []
    errors: list[str] = []
    existing_tables = fetch_existing_tables(connection, database)

    for table_name, table_schema in schema.items():
        if table_name not in existing_tables:
            actions.append(build_create_table_sql(table_name, table_schema))
            continue

        existing_columns = fetch_existing_columns(connection, database, table_name)
        for column in table_schema["columns"]:
            existing_column = existing_columns.get(column["name"])
            if existing_column is None:
                actions.append(build_add_column_sql(table_name, column))
                continue
            errors.extend(_validate_column_contract(table_name, column, existing_column))

        existing_indexes = fetch_existing_indexes(connection, database, table_name)
        errors.extend(_validate_indexes(table_name, table_schema, existing_indexes))
        existing_foreign_keys = fetch_existing_foreign_keys(
            connection,
            database,
            table_name,
        )
        errors.extend(
            _validate_foreign_keys(table_name, table_schema, existing_foreign_keys)
        )

        if table_name == "users" and "username" in existing_columns:
            ambiguous_count = fetch_ambiguous_username_count(connection, database)
            if ambiguous_count:
                errors.append(
                    "users contains "
                    f"{ambiguous_count} unsupported or contact-shaped username(s); "
                    "rename them before enabling the canonical username/contact "
                    "login namespaces"
                )

    return actions, errors


def apply_plan(connection: Any, actions: Iterable[str]) -> None:
    with connection.cursor() as cursor:
        for sql in actions:
            cursor.execute(sql)
    connection.commit()


def validate_schema(connection: Any, database: str) -> list[str]:
    actions, errors = build_plan(connection, database)
    if actions:
        errors.extend(f"pending schema action: {action.splitlines()[0]}" for action in actions)
    return errors


def resolve_config_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (api_root() / path).resolve()


def load_api_config() -> dict[str, Any]:
    import yaml

    env = os.getenv("ENV", "local")
    base_path = resolve_config_path(f"./src/conf/{env}.yml")
    if not base_path.exists():
        raise FileNotFoundError(f"API config file not found for ENV={env}: {base_path}")

    with base_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    override_raw = os.getenv("BLOG_CONFIG_OVERRIDE", f"./src/conf/{env}.override.yml")
    override_path = resolve_config_path(override_raw)
    if override_path.exists():
        with override_path.open("r", encoding="utf-8") as handle:
            override = yaml.safe_load(handle) or {}
        config = deep_merge(config, override)

    return config


def deep_merge(base: Any, override: Any) -> Any:
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        merged[key] = deep_merge(merged.get(key), value) if key in merged else value
    return merged


def connect_mysql(config: dict[str, Any]) -> Any:
    import pymysql
    from pymysql.cursors import DictCursor

    mysql_config = config["mysql"]
    return pymysql.connect(
        host=mysql_config["ip"],
        port=int(mysql_config["port"]),
        user=mysql_config["user"],
        password=mysql_config["password"],
        db=mysql_config["db"],
        charset="utf8mb4",
        autocommit=False,
        cursorclass=DictCursor,
        connect_timeout=int(os.getenv("MYSQL_CONNECT_TIMEOUT_SECONDS", "3")),
        read_timeout=int(os.getenv("MYSQL_READ_TIMEOUT_SECONDS", "5")),
        write_timeout=int(os.getenv("MYSQL_WRITE_TIMEOUT_SECONDS", "5")),
    )


def run_static_check() -> int:
    errors = validate_contract()
    if errors:
        print("MySQL schema contract check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    table_count = len(MYSQL_SCHEMA)
    column_count = sum(len(table["columns"]) for table in MYSQL_SCHEMA.values())
    print(f"MySQL schema contract check passed: {table_count} tables, {column_count} columns.")
    return 0


def run_database_mode(mode: str) -> int:
    config = load_api_config()
    database = config["mysql"]["db"]
    connection = connect_mysql(config)
    try:
        actions, errors = build_plan(connection, database)
        if errors:
            print("MySQL schema validation failed:")
            for error in errors:
                print(f"- {error}")
            return 1

        if mode == "validate":
            if actions:
                print("MySQL schema validation failed:")
                for action in actions:
                    print(f"- pending schema action: {action.splitlines()[0]}")
                return 1
            print("MySQL schema validation passed: no pending actions.")
            return 0

        if mode == "plan":
            if not actions:
                print("MySQL schema plan is empty: no changes needed.")
                return 0
            print("MySQL schema plan:")
            for action in actions:
                print(f"- {action.splitlines()[0]}")
            return 0

        apply_plan(connection, actions)
        validation_errors = validate_schema(connection, database)
        if validation_errors:
            print("MySQL schema validation failed after apply:")
            for error in validation_errors:
                print(f"- {error}")
            return 1
        print(f"MySQL schema apply passed: {len(actions)} action(s).")
        return 0
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate or apply the Sun World MySQL schema")
    parser.add_argument(
        "--mode",
        choices=["check", "plan", "validate", "apply"],
        default="check",
        help="check is static; plan/validate/apply connect to MySQL",
    )
    args = parser.parse_args(argv)

    if args.mode == "check":
        return run_static_check()
    return run_database_mode(args.mode)


if __name__ == "__main__":
    sys.exit(main())

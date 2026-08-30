from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class IntegrationCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$")
    description: str = Field(min_length=1, max_length=500)
    effect: Literal["read", "write", "delete"]
    required_fields: list[
        str
    ] = Field(
        default_factory=list,
        max_length=32,
    )
    confirmation: Literal["never", "write", "always"] = "write"

    @model_validator(mode="after")
    def validate_confirmation_policy(self):
        if len(set(self.required_fields)) != len(self.required_fields):
            raise ValueError("integration required fields must be unique")
        if any(
            not field.replace("_", "").isalnum()
            or not field[0].isalpha()
            or not field.islower()
            for field in self.required_fields
        ):
            raise ValueError("integration required fields must use snake_case")
        if self.effect == "read" and self.confirmation != "never":
            raise ValueError("read capabilities must not require confirmation")
        if self.effect != "read" and self.confirmation == "never":
            raise ValueError("mutating capabilities must require confirmation")
        return self


class IntegrationConnector(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1"] = "1"
    adapter_id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    display_name: str = Field(min_length=1, max_length=120)
    transport: Literal["cli", "http", "sdk", "mcp"]
    execution: Literal["local_cli", "server_worker"]
    official_source: str = Field(pattern=r"^https://")
    capabilities: list[IntegrationCapability] = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def validate_capability_ids(self):
        identifiers = [capability.id for capability in self.capabilities]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("integration capability IDs must be unique")
        return self

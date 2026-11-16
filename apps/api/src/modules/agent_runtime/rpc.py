"""Versioned private contracts; independent of the development v1 protocol."""

import json
import math
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

PROTOCOL = 'sun-world-agent/2'
Identifier = Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,128}$')]
Hash = Annotated[str, StringConstraints(pattern=r'^[0-9a-f]{64}$')]
Token = Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{32,128}$')]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class ExecutionBinding(StrictModel):
    protocol: Literal['sun-world-agent/2']
    run_id: str
    execution_id: str
    generation: Literal[1]
    bundle_hash: Hash

    @field_validator('run_id', 'execution_id')
    @classmethod
    def canonical_uuid(cls, value):
        if str(UUID(value)) != value:
            raise ValueError('Canonical UUID required')
        return value

    @field_validator('generation', mode='before')
    @classmethod
    def integer_generation(cls, value):
        if type(value) is not int:
            raise ValueError('Integer generation required')
        return value


class Credentials(StrictModel):
    tool: Token = Field(repr=False)
    model: Token = Field(repr=False)
    result: Token = Field(repr=False)


class ExecutionStart(ExecutionBinding):
    app_id: Literal['sun-world']
    scenario: Literal['blog-qa']
    model_id: str = Field(min_length=1, max_length=160)
    root_session_id: str = Field(min_length=1, max_length=64)
    deadline: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$')
    question: str = Field(min_length=1, max_length=2000, repr=False)
    credentials: Credentials = Field(repr=False)

    @field_validator('deadline')
    @classmethod
    def valid_deadline(cls, value):
        datetime.fromisoformat(value.replace('Z', '+00:00'))
        return value

    @field_validator('root_session_id')
    @classmethod
    def root_session(cls, value, info):
        if value != 'blog-qa-' + info.data.get('run_id', ''):
            raise ValueError('Root session mismatch')
        return value


class ExecutionAck(ExecutionBinding):
    status: Literal['running', 'completed', 'failed', 'cancelled', 'interrupted']


class RootRegistration(StrictModel):
    root_turn_id: Identifier
    root_request_id: Identifier


class ToolInvocation(StrictModel):
    call_id: Identifier
    tool_version: Literal['1']
    arguments: dict


class DeliveryReceipt(StrictModel):
    call_id: Identifier
    result_hash: Hash


class FinalResult(RootRegistration):
    root_session_id: str = Field(min_length=1, max_length=64)
    finish: Literal['completed']
    answer: str = Field(min_length=1, max_length=8000)
    source_ids: list[str] = Field(max_length=8)

    @field_validator('source_ids')
    @classmethod
    def sources(cls, values):
        if len(set(values)) != len(values) or any(str(UUID(value)) != value for value in values):
            raise ValueError('Unique canonical source UUIDs required')
        return values


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    def invalid_constant(_value):
        raise ValueError('Nonfinite JSON number')
    def finite_float(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError('Nonfinite JSON number')
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid_constant, parse_float=finite_float)


def contract():
    models = (ExecutionBinding, ExecutionStart, ExecutionAck, RootRegistration,
              ToolInvocation, DeliveryReceipt, FinalResult)
    return {'protocol': PROTOCOL, 'schemas': {model.__name__: model.model_json_schema() for model in models}}

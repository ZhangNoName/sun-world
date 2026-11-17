from pydantic import BaseModel, ConfigDict
from src.type.user_type import User
from src.type.management_type import (
    BindResourcesModel, ResourceCreateModel, ResourceUpdateModel, RoleCreateModel, RoleUpdateModel,
)


class UserCreate(User):
    model_config = ConfigDict(extra='forbid')


class RoleCreate(RoleCreateModel):
    model_config = ConfigDict(extra='forbid')


class RoleUpdate(RoleUpdateModel):
    model_config = ConfigDict(extra='forbid')


class RoleBind(BindResourcesModel):
    model_config = ConfigDict(extra='forbid')


class ResourceCreate(ResourceCreateModel):
    model_config = ConfigDict(extra='forbid')


class ResourceUpdate(ResourceUpdateModel):
    model_config = ConfigDict(extra='forbid')


class NoParameters(BaseModel):
    model_config = ConfigDict(extra='forbid')


PARAMETER_SCHEMAS = {
    'user.create': UserCreate, 'user.disable': NoParameters,
    'role.create': RoleCreate, 'role.update': RoleUpdate, 'role.delete': NoParameters,
    'role.bind_resources': RoleBind, 'resource.create': ResourceCreate,
    'resource.update': ResourceUpdate, 'resource.delete': NoParameters,
}

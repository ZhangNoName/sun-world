from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS
from src.core.module_registry import HttpEntry, ModuleManifest
from .policy import CAPABILITIES


MANAGEMENT_HTTP_ACTIONS = {
    ('POST', '/user/'): 'user.create', ('DELETE', '/user/{user_id}'): 'user.disable',
    ('POST', '/role/'): 'role.create', ('PUT', '/role/{role_id}'): 'role.update',
    ('DELETE', '/role/{role_id}'): 'role.delete',
    ('POST', '/role/{role_id}/bind_resources'): 'role.bind_resources',
    ('POST', '/resource/'): 'resource.create', ('PUT', '/resource/{resource_id}'): 'resource.update',
    ('DELETE', '/resource/{resource_id}'): 'resource.delete',
}


MANAGEMENT_MANIFEST = ModuleManifest(
    id='identity-management', version='1', owner='management',
    capabilities=tuple(CAPABILITIES.values()),
    http_entries=tuple(HttpEntry(method, path) for method, path in sorted(ADMIN_STEP_UP_OPERATIONS)),
    data_owners=tuple('mysql.' + name for name in (
        'users', 'roles', 'user_roles', 'resources', 'role_resources', 'admin_change_audit')),
)

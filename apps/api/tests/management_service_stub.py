"""Explicit service substitute for preexisting HTTP guard/persistence tests.

It exercises the old manager oracle, not current-session service authorization.
The latter is tested with the real service in test_management_service.py.
"""

from types import SimpleNamespace


def persistence_service(*, auth=None, users=None, roles=None, resources=None):
    def execute(_token, action, parameters=None, *, target_id=None, audit=None):
        if action == 'user.create':
            return auth.register_user(parameters, audit=audit)
        if action == 'user.disable':
            return users.delete_user(target_id, audit=audit)
        values = parameters.model_dump(exclude_none=True) if parameters is not None else {}
        if action == 'role.create':
            return roles.create_role(values, audit=audit)
        if action == 'role.update':
            return roles.update_role(target_id, **values, audit=audit)
        if action == 'role.delete':
            return roles.delete_role(target_id, audit=audit)
        if action == 'role.bind_resources':
            return roles.bind_resources(target_id, values['resource_ids'], audit=audit)
        if action == 'resource.create':
            return resources.create_resource(values, audit=audit)
        if action == 'resource.update':
            return resources.update_resource(target_id, **values, audit=audit)
        if action == 'resource.delete':
            return resources.delete_resource(target_id, audit=audit)
        raise AssertionError('Unsupported synthetic operation')
    return SimpleNamespace(execute=execute)

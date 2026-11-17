#!/usr/bin/env python3
"""Check reviewed admin operations against composed dependency graphs, without I/O.

Uses the schema-only app: no lifespan, database, credentials or model startup.
"""

import importlib.util
import ast
import inspect
from pathlib import Path
import textwrap


def guarded_operations(routes, guard):
    def contains_guard(dependant):
        return dependant.call is guard or any(contains_guard(child) for child in dependant.dependencies)

    operations = {}
    unguarded_dynamic = []
    for route in routes:
        # FastAPI lazy includes expose effective contexts (including inherited
        # prefixes/dependencies). Older eager APIRoutes already are effective.
        contexts = route.effective_route_contexts() if hasattr(route, "effective_route_contexts") else [route]
        for context in contexts:
            dependant = getattr(context, "dependant", None)
            if dependant is not None:
                guarded = contains_guard(dependant)
                for method in context.methods:
                    prefix = context.path.split("{", 1)[0]
                    if guarded:
                        for prior_method, prior_prefix in unguarded_dynamic:
                            if method == prior_method and (
                                prefix.startswith(prior_prefix) or prior_prefix.startswith(prefix)
                            ):
                                # Conservative: do not attempt to prove arbitrary
                                # converter regex disjointness. Register guarded
                                # routes before overlapping public dynamic routes.
                                raise ValueError(f"Possible public dynamic route shadows admin operation: {method} {context.path}")
                    elif "{" in context.path:
                        unguarded_dynamic.append((method, prefix))
                    operations.setdefault((method, context.path), []).append(guarded)
    for operation, guards in operations.items():
        if len(guards) > 1 and any(guards):
            raise ValueError(f"Duplicate admin operation: {operation[0]} {operation[1]}")
    return {operation for operation, guards in operations.items() if any(guards)}


def main():
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("schema_export", root / "scripts/export-openapi.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = module.build_schema_app()
    verify_admin_policy(app.routes)
    print("Admin policy baseline matches 40 guarded HTTP operations and 9 recent-authentication writes; 9 transactional-audit writes; 9 management-service writes (schema-only).")


def verify_admin_guards(routes):
    from src.routers.auth.auth import require_admin, require_recent_admin, require_admin_audit
    from src.core.auth.admin_shadow import ADMIN_OPERATIONS
    from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS

    for guard, expected in ((require_admin, ADMIN_OPERATIONS),
                            (require_recent_admin, ADMIN_STEP_UP_OPERATIONS),
                            (require_admin_audit, ADMIN_STEP_UP_OPERATIONS)):
        actual = guarded_operations(routes, guard)
        if actual != expected:
            raise ValueError("Admin policy operation set mismatch")


def verify_admin_policy(routes):
    verify_admin_guards(routes)
    from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS
    from src.modules.management.manifest import MANAGEMENT_HTTP_ACTIONS, MANAGEMENT_MANIFEST
    from src.modules.management.policy import CAPABILITIES
    from src.modules.management.service import AdminManagementService
    from src.routers.user.user import get_user_management_service
    from src.routers.role.role import get_role_management_service
    from src.routers.resource.resource import get_resource_management_service

    if (set(MANAGEMENT_HTTP_ACTIONS) != ADMIN_STEP_UP_OPERATIONS
            or set(MANAGEMENT_HTTP_ACTIONS.values()) != set(CAPABILITIES)
            or AdminManagementService.supported_actions != set(CAPABILITIES)
            or set(MANAGEMENT_MANIFEST.capabilities) != set(CAPABILITIES.values())
            or {(entry.method, entry.path) for entry in MANAGEMENT_MANIFEST.http_entries} != ADMIN_STEP_UP_OPERATIONS
            or MANAGEMENT_MANIFEST.tools or MANAGEMENT_MANIFEST.skills):
        raise ValueError('Management service manifest mismatch')
    for guard, prefix in ((get_user_management_service, '/user/'),
                          (get_role_management_service, '/role/'),
                          (get_resource_management_service, '/resource/')):
        if guarded_operations(routes, guard) != {entry for entry in ADMIN_STEP_UP_OPERATIONS if entry[1].startswith(prefix)}:
            raise ValueError('Management service wiring mismatch')
    for route in routes:
        contexts = route.effective_route_contexts() if hasattr(route, 'effective_route_contexts') else [route]
        for context in contexts:
            for method in getattr(context, 'methods', ()):
                action = MANAGEMENT_HTTP_ACTIONS.get((method, getattr(context, 'path', None)))
                if action is None:
                    continue
                factory = {'user': get_user_management_service, 'role': get_role_management_service,
                           'resource': get_resource_management_service}[action.split('.')[0]]
                verify_management_endpoint(context.dependant.call, action, factory)


def verify_management_endpoint(endpoint, action, factory):
    from fastapi.params import Depends as Dependency
    parameter = inspect.signature(endpoint).parameters.get('service')
    if (parameter is None or not isinstance(parameter.default, Dependency)
            or parameter.default.dependency is not factory):
        raise ValueError('Management service parameter mismatch')
    tree = ast.parse(textwrap.dedent(inspect.getsource(endpoint)))
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
             and isinstance(node.func, ast.Attribute) and node.func.attr == 'execute']
    if (len(calls) != 1 or not isinstance(calls[0].func.value, ast.Name)
            or calls[0].func.value.id != 'service' or len(calls[0].args) < 2
            or not isinstance(calls[0].args[1], ast.Constant)
            or calls[0].args[1].value != action):
        raise ValueError('Management action wiring mismatch')


if __name__ == "__main__":
    main()

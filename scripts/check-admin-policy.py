#!/usr/bin/env python3
"""Check reviewed admin operations against composed dependency graphs, without I/O.

Uses the schema-only app: no lifespan, database, credentials or model startup.
"""

import importlib.util
from pathlib import Path


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
    from src.routers.auth.auth import require_admin
    from src.core.auth.admin_shadow import ADMIN_OPERATIONS

    actual = guarded_operations(app.routes, require_admin)
    missing, stale = actual - ADMIN_OPERATIONS, ADMIN_OPERATIONS - actual
    if missing or stale:
        for operation in sorted(missing):
            print("Unreviewed admin operation:", *operation)
        for operation in sorted(stale):
            print("Missing admin guard or removed operation:", *operation)
        raise SystemExit(1)
    print(f"Admin policy baseline matches {len(actual)} guarded HTTP operations (schema-only).")


if __name__ == "__main__":
    main()

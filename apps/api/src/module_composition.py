"""Explicit API composition root; importing this does not enable Agent runs."""

from src.core.module_registry import ModuleRegistry
from src.modules.blog.manifest import BLOG_MANIFEST, BLOG_SCHEMAS
from src.modules.management.manifest import MANAGEMENT_MANIFEST


def create_module_registry() -> ModuleRegistry:
    return ModuleRegistry((BLOG_MANIFEST, MANAGEMENT_MANIFEST), BLOG_SCHEMAS)


def create_blog_qa_application(database, content_database, *, auth_manager, redis_client,
                               worker, model_proxy, worker_credential, bundle_hash,
                               model_id, site_origin, user_ids, enabled,
                               require_admin=True, admission_namespace='agent:blog-qa:{sun-world}'):
    """Explicit formal composition; caller owns TLS, secrets and router mounting.

    No environment lookup, connection or background task occurs on import.
    The host must replace the dev router, never mount both implementations.
    Redis must have bounded socket/connect timeouts before this factory is used.
    """
    from src.modules.agent_runtime.admission import RedisRunAdmission
    from src.modules.agent_runtime.application import RunApplication
    from src.modules.agent_runtime.ledger import MySqlRunLedger
    from src.modules.blog.public import create_public_tools

    settings = redis_client.connection_pool.connection_kwargs
    if any(type(settings.get(key)) not in (int, float) or not 0 < settings[key] <= 2
           for key in ('socket_timeout', 'socket_connect_timeout')):
        raise ValueError('Bounded Redis timeouts required')
    if (settings.get('retry') is not None or settings.get('retry_on_error')
            or settings.get('retry_on_timeout')):
        raise ValueError('Redis command retries must be disabled')
    tools = create_public_tools(database, content_database)

    def read_source(uow, principal, article_id):
        return create_public_tools(uow, content_database).read_public(principal, {'article_id': article_id})

    return RunApplication(MySqlRunLedger(database), auth_manager=auth_manager,
        admission=RedisRunAdmission(redis_client, namespace=admission_namespace), worker=worker,
        registry=create_module_registry(), handlers={'blog.search_public': tools.search_public,
            'blog.read_public': tools.read_public}, source_reader=read_source,
        model_proxy=model_proxy, worker_credential=worker_credential, bundle_hash=bundle_hash,
        model_id=model_id, site_origin=site_origin, user_ids=user_ids, enabled=enabled,
        require_admin=require_admin)

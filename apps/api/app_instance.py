# app_instance.py
import os
from pathlib import Path
import yaml
from fastapi import FastAPI
from contextlib import asynccontextmanager
from loguru import logger
from src.core.audit_log import audit_log
from src.core.csrf import CookieCsrfMiddleware
from src.core.logging import configure_logging
from fastapi.middleware.cors import CORSMiddleware
from src.core.observability import ObservabilityMiddleware
from src.core.runtime_env import is_local_runtime
from fastapi.staticfiles import StaticFiles
from src.controller.ai_manager import AiManager
from src.controller.auth_manager import AuthManager
from src.controller.base_manage import BaseManager
from src.controller.blog_manage import BlogManager
from src.controller.file_manager import FileManager
from src.controller.tag_manage import TagManager
from src.controller.user_manage import UserManager
from src.controller.role_manager import RoleManager
from src.controller.resource_manager import ResourceManager
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.mysql_manage import MySQLManager
from src.database.postgresql.postgresql_manager import PostgreSQLManager
from src.database.redis.redis_manage import RedisManager

configure_logging()


def _deep_merge(base, override):
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override

    merged = dict(base)
    for key, value in override.items():
        if key in merged:
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_config_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (Path(__file__).resolve().parent / path).resolve()


def _require_mapping_config(config: object, config_path: Path, description: str) -> dict:
    if not isinstance(config, dict):
        raise ValueError(
            f"{description} must be a YAML mapping/object; "
            f"got {type(config).__name__} from {config_path}"
        )
    return config


def get_credential_encryption_key(config: dict) -> str | None:
    ai_config = config.get("ai", {})
    configured_key = (
        ai_config.get("credential_encryption_key")
        if isinstance(ai_config, dict)
        else None
    )
    return configured_key or os.getenv("AI_CREDENTIAL_ENCRYPTION_KEY")


def get_mcp_allowed_hosts(config: dict) -> list[str]:
    raw_environment = os.getenv("AI_MCP_ALLOWED_HOSTS")
    if raw_environment is not None:
        return [host.strip() for host in raw_environment.split(",") if host.strip()]
    ai_config = config.get("ai", {})
    configured_hosts = ai_config.get("mcp_allowed_hosts", []) if isinstance(ai_config, dict) else []
    if isinstance(configured_hosts, str):
        configured_hosts = configured_hosts.split(",")
    if not isinstance(configured_hosts, list):
        raise RuntimeError("ai.mcp_allowed_hosts must be a list or comma-separated string")
    return [str(host).strip() for host in configured_hosts if str(host).strip()]


def _parse_origin_environment(variable_name: str) -> list[str] | None:
    """Return an explicit origin list and reject credentialed wildcards."""
    raw = os.getenv(variable_name)
    if not raw:
        return None
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if "*" in origins:
        raise RuntimeError(
            f"{variable_name} must not contain '*' when browser credentials are enabled"
        )
    return origins


class Application(FastAPI):
    def __init__(self, **args):
        super(Application, self).__init__(**args)
        allowed_origins = self.__get_allowed_origins()
        self.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        self.add_middleware(
            CookieCsrfMiddleware,
            allowed_origins=self.__get_csrf_allowed_origins(),
        )
        # Added after CORS so Starlette builds observability as the outer
        # project middleware and records CORS/preflight outcomes too.
        self.add_middleware(ObservabilityMiddleware)

    @staticmethod
    def __get_allowed_origins():
        configured_origins = _parse_origin_environment("BLOG_CORS_ORIGINS")
        if configured_origins is not None:
            return configured_origins
        origins = [
            "https://sunworld.site",
            "https://www.sunworld.site",
            "https://zsf.shopping",
            "https://www.zsf.shopping",
        ]
        if is_local_runtime():
            origins.extend(
                [
                    "http://localhost:3030",
                    "http://127.0.0.1:3030",
                ]
            )
        return origins

    @staticmethod
    def __get_csrf_allowed_origins():
        configured_origins = _parse_origin_environment(
            "AUTH_CSRF_ALLOWED_ORIGINS"
        )
        if configured_origins is not None:
            return configured_origins

        # This write-authority allowlist is intentionally narrower than CORS:
        # compatibility frontends may read the API without receiving implicit
        # permission to submit cookie-authenticated mutations.
        origins = [
            "https://sunworld.site",
            "https://www.sunworld.site",
            "https://api.sunworld.site",
        ]
        if is_local_runtime():
            origins.extend(
                [
                    "http://localhost:3030",
                    "http://127.0.0.1:3030",
                    "http://localhost:8000",
                    "http://127.0.0.1:8000",
                ]
            )

        public_api_origin = os.getenv("AUTH_PUBLIC_API_ORIGIN")
        if public_api_origin and public_api_origin not in origins:
            origins.append(public_api_origin)
        return origins

    async def init(self, env='dev'):
        self.load_config(env=env)
        self.__init__mongoDB()
        self.__init__redis()
        self.__init__mysql()
        self.__init__postgresql()
        await self.__init__ai_manager()
        # AI Manager 的初始化移到 lifespan 中，因为需要异步操作
        self.__init_blog_manager()
        self.__init_user_manager()
        self.__init_tag_manager()
        self.__init_base_manager()
        self.__init_role_manager()
        self.__init_reousrce_manager()
        self.__init_auth_manager()
        self.__init_identity_service()
        self.__init_ai_workspace_service()
        self.__init_dictionary_service()
        self.__init_file_manager()
        logger.info(f'当前模式为{env}')
        if env == 'local':
            pass
        else:
            pass

    async def shut_down(self, env='dev'):
        await self.__cleanup_ai_manager()
        if env == 'local':
            pass
        else:
            pass

    def load_config(self, env='dev'):
        config_path = _resolve_config_path(f'./src/conf/{env}.yml')

        if not config_path.exists():
            raise FileNotFoundError(
                f"Configuration file not found: {config_path}")

        with open(config_path, 'r', encoding='utf-8') as file:
            self.config = _require_mapping_config(
                yaml.safe_load(file), config_path, "Base config"
            )

        override_path = os.getenv(
            'BLOG_CONFIG_OVERRIDE',
            f'./src/conf/{env}.override.yml'
        )
        override_path = _resolve_config_path(override_path)

        if override_path.exists():
            with open(override_path, 'r', encoding='utf-8') as file:
                raw_override = yaml.safe_load(file)
                if raw_override is None:
                    override_config = {}
                else:
                    override_config = _require_mapping_config(
                        raw_override,
                        override_path,
                        "Override config",
                    )

            self.config = _deep_merge(self.config, override_config)
            logger.info(f'Loaded {env} override configuration from {override_path}')

        credentials_path = _resolve_config_path(
            f'./src/conf/{env}.ai-credentials.yml'
        )
        if credentials_path.exists():
            with open(credentials_path, 'r', encoding='utf-8') as file:
                credentials_config = _require_mapping_config(
                    yaml.safe_load(file),
                    credentials_path,
                    "AI credentials config",
                )
            self.config = _deep_merge(self.config, credentials_config)
            logger.info(f'Loaded {env} AI credentials configuration')
        logger.info(f'Loaded {env} configuration from {config_path}')
        logger.debug(f'Loaded configuration sections: {list((self.config or {}).keys())}')

    def __init__mongoDB(self):
        self.mongo = MongoDBManager(ip=self.config['mongo']['ip'], port=self.config['mongo']['port'], db=self.config['mongo']
                                    ['db'], user=self.config['mongo']['user'], password=self.config['mongo']['password'])

    def __init__redis(self):
        self.redis = RedisManager(ip=self.config['redis']['ip'], port=self.config['redis']['port'],
                                  db=self.config['redis']['db'], auth=self.config['redis']['auth'], key_prefix='blog')

    def __init__mysql(self):
        self.mysql = MySQLManager(host=self.config['mysql']['ip'], port=self.config['mysql']['port'],
                                  db=self.config['mysql']['db'], user=self.config['mysql']['user'], password=self.config['mysql']['password'])

    def __init__postgresql(self):
        self.postgresql = PostgreSQLManager(ip=self.config['postgresql']['ip'], port=self.config['postgresql']['port'],
                                            db=self.config['postgresql']['db'], user=self.config['postgresql']['user'], password=self.config['postgresql']['password'])

    async def __init__ai_manager(self):
        """初始化 AI Manager（异步）"""
        from urllib.parse import quote_plus
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        db_user = self.config['postgresql']['user']
        db_password = self.config['postgresql']['password']
        db_host = self.config['postgresql']['ip']
        db_port = self.config['postgresql']['port']
        db_name = self.config['postgresql']['db']
        safe_password = quote_plus(db_password)
        DB_URI = f"postgresql://{db_user}:{safe_password}@{db_host}:{db_port}/{db_name}?sslmode=disable"

        # 创建 checkpointer 上下文管理器并手动进入
        checkpointer_context = AsyncPostgresSaver.from_conn_string(DB_URI)
        checkpointer = await checkpointer_context.__aenter__()
        await checkpointer.setup()

        # 保存 checkpointer 和上下文管理器，以便在关闭时清理
        self._ai_checkpointer = checkpointer
        self._ai_checkpointer_context = checkpointer_context
        self.ai = AiManager(checkpointer=checkpointer)
        logger.info("AI Manager 初始化成功")

    async def __cleanup_ai_manager(self):
        """清理 AI Manager 资源（异步）"""
        if not hasattr(self, '_ai_checkpointer_context'):
            logger.debug("AI Manager checkpointer 未初始化，跳过清理")
            return

        if self._ai_checkpointer_context:
            try:
                await self._ai_checkpointer_context.__aexit__(None, None, None)
                logger.info("AI Manager checkpointer 已关闭")
            except Exception as e:
                logger.error(f"关闭 AI Manager checkpointer 失败: {e}")

    def __init_blog_manager(self):
        self.blog = BlogManager(baseDB=self.mysql, contentDB=self.mongo)

    def __init_user_manager(self):
        self.user = UserManager(db=self.mysql)

    def __init_tag_manager(self):
        self.tag = TagManager(db=self.mysql)

    def __init_base_manager(self):
        self.base = BaseManager(db=self.mysql)

    def __init_role_manager(self):
        self.role = RoleManager(db=self.mysql)

    def __init_reousrce_manager(self):
        self.resource = ResourceManager(db=self.mysql)

    def __init_auth_manager(self):
        auth_config = self.config.get('auth', {})
        jwt_secret = os.getenv('BLOG_JWT_SECRET') or auth_config.get('jwt_secret')
        if not jwt_secret:
            raise RuntimeError(
                "BLOG_JWT_SECRET is required. Set it in the service environment "
                "or in a protected local config before starting the API."
            )
        self.auth = AuthManager(
            user_manager=self.user,
            db=self.redis,
            enable_permission=False,
            access_token_expire_minutes=auth_config.get(
                'access_token_expire_minutes'),
            refresh_token_expire_days=auth_config.get(
                'refresh_token_expire_days'),
            secret_key=jwt_secret
        )

    def __init_identity_service(self):
        from src.modules.identity.providers import OAuthProviderRegistry
        from src.modules.identity.repository import MySqlIdentityRepository
        from src.modules.identity.service import IdentityService
        from src.modules.identity.verification import (
            VerificationDeliveryRegistry,
            VerificationService,
        )

        env = os.getenv("ENV", "local")
        local_runtime = is_local_runtime()
        default_api_origin = (
            "http://localhost:8000"
            if local_runtime
            else "https://api.sunworld.site"
        )
        default_web_origin = (
            "http://localhost:3030"
            if local_runtime
            else "https://sunworld.site"
        )
        verification = VerificationService(
            self.redis,
            VerificationDeliveryRegistry.from_env(),
            pepper=(
                os.getenv("AUTH_VERIFICATION_PEPPER")
                or self.auth.secret_key
            ),
        )
        self.identity_service = IdentityService(
            repository=MySqlIdentityRepository(self.mysql),
            auth_manager=self.auth,
            redis=self.redis,
            providers=OAuthProviderRegistry.from_env(),
            verification=verification,
            public_api_origin=os.getenv(
                "AUTH_PUBLIC_API_ORIGIN", default_api_origin
            ),
            public_web_origin=os.getenv(
                "AUTH_PUBLIC_WEB_ORIGIN", default_web_origin
            ),
        )

    def __init_ai_workspace_service(self):
        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.mcp_gateway import McpGateway
        from src.modules.ai.mcp_repository import MySqlAiMcpRepository
        from src.modules.ai.mcp_service import AiMcpService
        from src.modules.ai.providers import ProviderRegistry
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.service import AiService

        cipher = CredentialCipher(get_credential_encryption_key(self.config))
        self.ai_service = AiService(
            repository=MySqlAiRepository(self.mysql),
            providers=ProviderRegistry(),
            cipher=cipher,
        )
        allowed_hosts = get_mcp_allowed_hosts(self.config)
        if not allowed_hosts:
            self.ai_mcp_service = None
            logger.info("MCP workspace is disabled because no allowed hosts are configured")
            return
        self.ai_mcp_service = AiMcpService(
            repository=MySqlAiMcpRepository(self.mysql),
            gateway=McpGateway(allowed_hosts=allowed_hosts),
            cipher=cipher,
        )
        logger.info("MCP workspace initialized with {} allowed host rule(s)", len(allowed_hosts))

    def __init_dictionary_service(self):
        from src.modules.dictionaries.repository import MySqlDictionaryRepository
        from src.modules.dictionaries.service import DictionaryService

        self.dictionary_service = DictionaryService(MySqlDictionaryRepository(self.mysql))

    def __init_file_manager(self):
        self.file = FileManager()
        # 确保目录存在
        os.makedirs(self.config['file']['videos_dir'], exist_ok=True)
        # 挂载静态服务，这样前端就能通过 http://ip/static/v_001/master.m3u8 访问了
        self.mount(
            "/static", StaticFiles(directory=self.config['file']['videos_dir']), name="static")


@asynccontextmanager
async def lifespan(app: Application):
    env = os.getenv('ENV', 'local')
    audit_log.start()
    try:
        await app.init(env)
        logger.debug('start up event')
        yield
    finally:
        try:
            await app.shut_down()
            logger.debug('stop event')
        finally:
            audit_log.stop()

app = Application(lifespan=lifespan)

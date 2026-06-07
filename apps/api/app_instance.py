# app_instance.py
import os
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import yaml
from fastapi import FastAPI
from contextlib import asynccontextmanager
from loguru import logger
from src.core.logging import configure_logging
from fastapi.middleware.cors import CORSMiddleware
from src.core.observability import ObservabilityMiddleware
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
        # Added after CORS so Starlette builds observability as the outer
        # project middleware and records CORS/preflight outcomes too.
        self.add_middleware(ObservabilityMiddleware)

    @staticmethod
    def __get_allowed_origins():
        raw = os.getenv("BLOG_CORS_ORIGINS")
        if raw:
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
        return [
            "https://sunworld.site",
            "https://www.sunworld.site",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]

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
        config_path = f'./src/conf/{env}.yml'

        if not os.path.exists(config_path):
            raise FileNotFoundError(
                f"Configuration file not found: {config_path}")

        with open(config_path, 'r') as file:
            self.config = yaml.safe_load(file)
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
    await app.init(env)
    logger.debug('start up event')
    yield
    await app.shut_down()
    logger.debug('stop event')

app = Application(lifespan=lifespan)

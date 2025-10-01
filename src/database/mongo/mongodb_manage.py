from typing import Optional
from pymongo import MongoClient
from loguru import logger
from pymongo.cursor import Cursor

class MongoDBManager:
    """mongo服务"""
    logger = logger
    def __init__(self, ip, port, db, user=None, password=None, **kwargs):
        super().__init__()

        self.ip = ip
        self.port = port
        self.dbname = db
        self.user = user # 对用户名进行URL编码
        self.password = password

        self.connect()
        self.ping()

    def __repr__(self) -> str:
        return "mongodb {}:{} db:{}".format(self.ip, self.port, self.dbname)

    def connect(self) -> bool:
        try:
            # 在MongoClient中直接进行认证
            pool = MongoClient(self.ip, self.port, username=self.user, password=self.password)
            self.db = pool[self.dbname]  # 获取数据库对象
            self.logger.debug(f"{self} authenticated")
        except Exception as ex:
            self.db = None
            self.logger.error(f"failed to connect {self}: {ex}")
            return False
        else:
            return True

    def _maybe_reconnect(self):
        if self.db is None and not self.connect():
            raise Exception()

    def ping(self) -> bool:
        """
        ping 探活
        """
        try:
            self._maybe_reconnect()

            return True
        except:
            return False
    
    def find(self, collection_name: str, filter, batch_size: int = 0) -> Cursor:
        """
        查询
        @param collection_name: collection名
        @param filter: 查询的过滤条件
        @param batch_size: 查询批量大小
        @return 结果
        """
        self._maybe_reconnect()

        output = self.db[collection_name].find(filter).batch_size(batch_size)
        return output
    
    def find_all(self, collection_name: str, filter) -> Cursor:
        """
        查询集合collection_name中的全部数据
        @param collection_name: collection名
        @param filter: 查询的过滤条件
        @return 结果
        """
        self._maybe_reconnect()

        output = self.db[collection_name].find(filter)
        return output
    

    def find_page_query(self, collection_name: str, filter, page_size: int = 0, skip: int = 0,
                        sort_by: str = '', sort_num: int = 1) -> Cursor:
        """
        查询
        @param collection_name: collection名
        @param filter: 查询的过滤条件
        @param page_size: 每页批量大小
        @param skip: 偏移量
        @param sort_by: 排序字段
        @param sort_num: 排序规则
        @return 结果
        """
        self._maybe_reconnect()
        if sort_by:
            output = self.db[collection_name].find(filter).limit(page_size).skip(skip).sort(sort_by, sort_num)
        else:
            output = self.db[collection_name].find(filter).limit(page_size).skip(skip)
        return output

    def find_count(self, collection_name: str, filter={}) -> Cursor:
        """
        查询
        @param collection_name: collection名
        @param filter: 查询的过滤条件
        @return 结果
        """
        self._maybe_reconnect()

        output = self.db[collection_name].count_documents(filter)
        return output

    def find_one(self, collection_name: str, filter:dict) ->  Optional[dict]:
        """
        查询一个结果
        @param collection_name: collection名
        @param filter: 查询的过滤条件
        @return 结果
        """
        self._maybe_reconnect()

        output = self.db[collection_name].find_one(filter)
        return output

    def insert_one(self, collection_name: str, document) -> bool:
        """
        插入单个文档
        @param collection_name: collection名
        @param document: 插入的文档
        @return: 插入成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            self.db[collection_name].insert_one(document)
            return True
        except Exception as ex:
            self.logger.error(f"Insert failed in {collection_name}: {ex}")
            return False

    def insert_many(self, collection_name: str, documents) -> bool:
        """
        插入多个文档
        @param collection_name: collection名
        @param documents: 插入的文档列表
        @return: 插入成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            self.db[collection_name].insert_many(documents)
            return True
        except Exception as ex:
            self.logger.error(f"Insert failed in {collection_name}: {ex}")
            return False

    def update_one(self, collection_name: str, filter, update,upsert:bool=True) -> bool:
        """
        更新单个文档
        @param collection_name: collection名
        @param filter: 更新的过滤条件
        @param update: 更新操作
        @param upsert: 没有应数据是否新建,默认为True(没有就新建)
        @return: 更新成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            res = self.db[collection_name].update_one(filter, {"$set": update},upsert=upsert)
            if res.matched_count == 0:
                return False
            return True
        except Exception as ex:
            self.logger.error(f"Update failed in {collection_name}: {ex}")
            return False

    def update_many(self, collection_name: str, filter, update) -> bool:
        """
        更新多个文档
        @param collection_name: collection名
        @param filter: 更新的过滤条件
        @param update: 更新操作
        @return: 更新成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            res = self.db[collection_name].update_many(filter, {"$set": update})
            if res.matched_count == 0:
                return False
            return True
        except Exception as ex:
            self.logger.error(f"Update failed in {collection_name}: {ex}")
            return False

    def delete_one(self, collection_name: str, filter) -> bool:
        """
        删除单个文档
        @param collection_name: collection名
        @param filter: 删除的过滤条件
        @return: 删除成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            res = self.db[collection_name].delete_one(filter)
            if res.deleted_count == 0:
                return False
            return True
        except Exception as ex:
            self.logger.error(f"Delete failed in {collection_name}: {ex}")
            return False

    def delete_many(self, collection_name: str, filter) -> bool:
        """
        删除多个文档
        @param collection_name: collection名
        @param filter: 删除的过滤条件
        @return: 删除成功返回True，否则False
        """
        try:
            self._maybe_reconnect()
            res = self.db[collection_name].delete_many(filter)
            if res.deleted_count == 0:
                return False
            return True
        except Exception as ex:
            self.logger.error(f"Delete failed in {collection_name}: {ex}")
            return False
        


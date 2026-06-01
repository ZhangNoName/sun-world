from loguru import logger
from pymongo.cursor import Cursor
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.mysql_manage import MySQLManager
from src.type.blog_type import Category
from src.type.tag_type import TagBase

class TagManager:
    def __init__(self,db:MySQLManager):
        self.db = db

    def get_tag(self, ) -> int:
        """返回标签列表"""
        sql = "SELECT id, name FROM tag"
        tags = self.db.execute(sql)
        logger.info(f"Tags fetched from database: {tags}")
        tag_list = [TagBase(id=tag['id'], name=tag['name']) for tag in tags]
        return tag_list
    
    def get_category(self, ) -> int:
        """返回标签列表"""
        sql = "SELECT id, name FROM category order by id"
        tags = self.db.execute(sql)
        logger.info(f"Category fetched from database: {tags}")
        tag_list = [Category(id=tag['id'], name=tag['name']) for tag in tags]
        return tag_list
"""Shared application dependency providers."""

from fastapi import HTTPException

from app_instance import app


def get_mysql_unit_of_work():
    manager = getattr(app, "mysql", None)
    if manager is None:
        raise HTTPException(status_code=500, detail="MySQL manager not initialized")
    return manager.unit_of_work

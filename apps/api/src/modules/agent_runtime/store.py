"""Local-development SQLite ledger; construction is disabled in production."""

import json
import sqlite3
import uuid
import os
from functools import wraps
from threading import RLock
from pathlib import Path


TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


def locked(function):
    @wraps(function)
    def invoke(self, *args, **kwargs):
        with self.lock:
            return function(self, *args, **kwargs)
    return invoke


class Store:
    def __init__(self, path):
        self.lock = RLock()
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        if str(path) != ":memory:":
            os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, key TEXT NOT NULL,
            question TEXT NOT NULL, status TEXT NOT NULL, answer TEXT,
            error_code TEXT, session_family TEXT, tool_count INTEGER DEFAULT 0, model_count INTEGER DEFAULT 0,
            result_bytes INTEGER DEFAULT 0, UNIQUE(user_id, key));
          CREATE TABLE IF NOT EXISTS calls (
            run_id TEXT NOT NULL, call_id TEXT NOT NULL, argument_hash TEXT NOT NULL,
            result TEXT NOT NULL, result_hash TEXT NOT NULL, delivered INTEGER DEFAULT 0,
            PRIMARY KEY(run_id, call_id));
          CREATE TABLE IF NOT EXISTS sources (
            run_id TEXT NOT NULL, call_id TEXT NOT NULL, article_id INTEGER NOT NULL,
            title TEXT NOT NULL, content_hash TEXT NOT NULL, delivered INTEGER DEFAULT 0,
            PRIMARY KEY(run_id, call_id, article_id));
        """)
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(runs)")}
        if "session_family" not in columns:
            self.db.execute("ALTER TABLE runs ADD COLUMN session_family TEXT")
        with self.db:
            self.db.execute("UPDATE runs SET status='interrupted', error_code='server_restarted' "
                            "WHERE status IN ('accepted','running')")

    @locked
    def close(self):
        self.db.close()

    @locked
    def get(self, run_id):
        row = self.db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        return dict(row) if row else None

    @locked
    def find_idempotent_run(self, user_id, key):
        row = self.db.execute("SELECT id FROM runs WHERE user_id=? AND key=?", (user_id, key)).fetchone()
        return row["id"] if row else None

    @locked
    def create(self, user_id, key, question, session_family=None):
        with self.db:
            existing = self.db.execute("SELECT id FROM runs WHERE user_id=? AND key=?", (user_id, key)).fetchone()
            if existing:
                return existing["id"], "duplicate"
            if self.db.execute("SELECT 1 FROM runs WHERE status IN ('accepted','running')").fetchone():
                return None, "busy"
            run_id = str(uuid.uuid4())
            self.db.execute("INSERT INTO runs(id,user_id,key,question,status,session_family) VALUES (?,?,?,?,'accepted',?)",
                            (run_id, user_id, key, question, session_family))
            return run_id, None

    @locked
    def transition(self, run_id, status, *, answer=None, error_code=None):
        with self.db:
            result = self.db.execute(
                "UPDATE runs SET status=?,answer=?,error_code=? WHERE id=? AND status IN ('accepted','running')",
                (status, answer, error_code, run_id))
            return result.rowcount == 1

    @locked
    def increment_model(self, run_id):
        with self.db:
            return self.db.execute("UPDATE runs SET model_count=model_count+1 WHERE id=? "
                                   "AND status='running' AND model_count<4", (run_id,)).rowcount == 1

    @locked
    def call(self, run_id, call_id):
        row = self.db.execute("SELECT * FROM calls WHERE run_id=? AND call_id=?", (run_id, call_id)).fetchone()
        return dict(row) if row else None

    @locked
    def save_call(self, run_id, call_id, argument_hash, result, result_hash, size, source=None):
        with self.db:
            updated = self.db.execute("UPDATE runs SET tool_count=tool_count+1,result_bytes=result_bytes+? "
                                     "WHERE id=? AND status='running' AND tool_count<4 "
                                     "AND result_bytes+?<=65536", (size, run_id, size))
            if updated.rowcount != 1:
                return False
            self.db.execute("INSERT INTO calls(run_id,call_id,argument_hash,result,result_hash) VALUES(?,?,?,?,?)",
                            (run_id, call_id, argument_hash, json.dumps(result, ensure_ascii=False), result_hash))
            if source:
                self.db.execute("INSERT INTO sources(run_id,call_id,article_id,title,content_hash) VALUES(?,?,?,?,?)",
                                (run_id, call_id, source["article_id"], source["title"], source["content_hash"]))
            return True

    @locked
    def receipt(self, run_id, call_id, result_hash):
        with self.db:
            call = self.call(run_id, call_id)
            if not call or call["result_hash"] != result_hash:
                return False
            self.db.execute("UPDATE calls SET delivered=1 WHERE run_id=? AND call_id=?", (run_id, call_id))
            self.db.execute("UPDATE sources SET delivered=1 WHERE run_id=? AND call_id=?", (run_id, call_id))
            return True

    @locked
    def sources(self, run_id):
        return [dict(row) for row in self.db.execute(
            "SELECT article_id,title,content_hash,delivered FROM sources WHERE run_id=?", (run_id,))]

    @locked
    def results(self, run_id):
        return [json.loads(row["result"]) for row in self.db.execute(
            "SELECT result FROM calls WHERE run_id=?", (run_id,))]

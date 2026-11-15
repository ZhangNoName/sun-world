"""Single-process local run control with bounded sandbox subprocess execution."""

import asyncio

import anyio
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import signal
import time
from pathlib import Path

from fastapi import HTTPException
from src.core.auth import Principal
from src.modules.blog.manifest import BLOG_MANIFEST

from .store import TERMINAL


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


async def finish_cleanup(cleanup):
    """Drain cleanup despite request-scope or repeated asyncio cancellation.

    The separate task keeps direct Task.cancel() calls from interrupting process
    teardown. AnyIO shielding prevents a disconnected response's level-triggered
    cancel scope from repeatedly cancelling each await. Cancellation is propagated
    again once owned resources have been reclaimed.
    """
    task = asyncio.create_task(cleanup)
    cancelled = False
    with anyio.CancelScope(shield=True):
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        task.result()
    if cancelled:
        raise asyncio.CancelledError


class Runtime:
    def __init__(self, store, tools, *, runner=None, model_proxy=None, model_label="未配置真实模型",
                 authenticate=None, article_url=None, api_origin="http://127.0.0.1:8011"):
        self.authenticate = authenticate
        self.article_url = article_url or (lambda article_id: f"/aigc/blog-qa?article={article_id}")
        self.api_origin = api_origin
        self.closing = False
        self.store = store
        self.tools = tools
        self.runner = runner or self.run_worker
        self.model_proxy = model_proxy
        self.model_label = model_label
        self.sessions = {}
        self.active = {}
        self.tasks = {}
        self.model_tasks = {}
        self.service_token = secrets.token_urlsafe(32)
        self.bundle_hash = json.loads((Path(__file__).resolve().parents[5] /
                                      "packages/contracts/agent/tool-catalog.json").read_text())["bundle_hash"]
        self.available = runner is not None or (
            Path("/usr/bin/sandbox-exec").is_file()
            and Path(os.environ.get("DSH_LOCAL_WORKER_DIR", "") + "/local-runner.mjs").is_file()
            and Path(os.environ.get("DSH_LOCAL_NODE", "")).is_file()
            and model_proxy is not None)

    def login(self, user_id):
        sid = secrets.token_urlsafe(32)
        self.sessions[sid] = (user_id, time.monotonic() + 3600)
        return sid

    def principal(self, sid):
        if self.authenticate is not None:
            return self.authenticate(sid)
        return Principal(kind="user", user_id=self.user(sid))

    def user(self, sid):
        if self.authenticate is not None:
            return self.authenticate(sid).user_id
        session = self.sessions.get(sid)
        if not session or session[1] <= time.monotonic():
            raise HTTPException(401, "local_session_required")
        return session[0]

    def owned(self, run_id, sid):
        user_id = self.user(sid)
        run = self.store.get(run_id)
        principal = self.principal(sid)
        if (not run or run["user_id"] != user_id
                or (run.get("session_family") and run["session_family"] != principal.session_family)):
            raise HTTPException(404, "run_not_found")
        return run

    def ensure_active(self, run_id):
        if self.closing:
            raise HTTPException(409, "runtime_shutting_down")
        state = self.active.get(run_id)
        run = self.store.get(run_id)
        if not state or not run or run["status"] != "running":
            raise HTTPException(409, "run_not_active")
        if time.monotonic() > state["deadline"]:
            raise HTTPException(409, "run_deadline_exceeded")
        principal = self.principal(state["sid"])
        if (principal.user_id != run["user_id"]
                or (run.get("session_family") and run["session_family"] != principal.session_family)):
            raise HTTPException(401, "session_revoked")
        return run, state

    def private(self, run_id, authorization, service):
        run, state = self.ensure_active(run_id)
        if not hmac.compare_digest(service or "", self.service_token):
            raise HTTPException(403, "worker_identity_required")
        if not hmac.compare_digest(authorization or "", "Bearer " + state["run_token"]):
            raise HTTPException(403, "run_credential_required")
        return run

    async def cancel(self, run_id, error_code=None):
        for model_task in self.model_tasks.get(run_id, set()).copy():
            if not model_task.cancelling():
                model_task.cancel()
        self.store.transition(run_id, "cancelled", error_code=error_code)
        task = self.tasks.get(run_id)
        if task and not task.done() and not task.cancelling():
            task.cancel()

    async def aclose(self):
        if self.closing:
            return
        self.closing = True
        self.available = False
        tasks = list(self.tasks.values())
        models = [task for group in self.model_tasks.values() for task in group]
        for run_id in list(self.active):
            await self.cancel(run_id, "server_shutdown")
        for task in models:
            if not task.cancelling():
                task.cancel()
        # Worker task completion includes TERM/KILL and workspace cleanup.
        await asyncio.gather(*tasks, *models, return_exceptions=True)
        self.active.clear()
        self.tasks.clear()
        self.model_tasks.clear()
        clear = getattr(self, "clear_credentials", None)
        if clear:
            clear()
        await asyncio.to_thread(self.store.close)

    async def logout(self, sid):
        user_id = self.user(sid)
        self.sessions.pop(sid, None)
        for run_id in list(self.active):
            run = self.store.get(run_id)
            if run["user_id"] == user_id:
                await self.cancel(run_id, "session_revoked")

    def start(self, run_id, sid):
        self.active[run_id] = {"sid": sid, "run_token": secrets.token_urlsafe(32),
                               "deadline": time.monotonic() + 45}
        self.tasks[run_id] = asyncio.create_task(self.execute(run_id))

    async def execute(self, run_id):
        state = self.active[run_id]
        self.store.transition(run_id, "running")
        run = self.store.get(run_id)
        payload = {"run_id": run_id, "question": run["question"],
                   "api_origin": self.api_origin, "run_token": state["run_token"],
                   "service_token": self.service_token, "bundle_hash": self.bundle_hash,
                   "deadline": time.time() + 45}
        monitor = asyncio.create_task(self.monitor(run_id)) if self.authenticate else None
        try:
            await asyncio.to_thread(self.ensure_active, run_id)
            result = await asyncio.wait_for(self.runner(run, payload), timeout=45)
            await asyncio.to_thread(self.complete, run_id, result)
        except asyncio.CancelledError:
            self.store.transition(run_id, "cancelled")
        except asyncio.TimeoutError:
            self.store.transition(run_id, "failed", error_code="run_timeout")
        except Exception as exc:
            code = exc.detail if isinstance(exc, HTTPException) else "worker_failed"
            self.store.transition(run_id, "failed", error_code=str(code))
        finally:
            await finish_cleanup(self.finish_execution(run_id, monitor))

    async def finish_execution(self, run_id, monitor):
        models = self.model_tasks.pop(run_id, set())
        try:
            pending = [*models, *([monitor] if monitor else [])]
            for task in pending:
                if not task.cancelling():
                    task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        finally:
            self.active.pop(run_id, None)
            self.tasks.pop(run_id, None)

    async def monitor(self, run_id):
        while True:
            await asyncio.sleep(.25)
            if self.store.get(run_id)["status"] in TERMINAL:
                return
            try:
                await asyncio.to_thread(self.ensure_active, run_id)
            except Exception:
                await self.cancel(run_id, "session_revoked")
                return

    def tool(self, run_id, tool_id, body):
        run, _ = self.ensure_active(run_id)
        tool = next((t for t in BLOG_MANIFEST.tools if t.id == tool_id), None)
        if not tool or body.generation != 1 or body.tool_version != tool.version:
            raise HTTPException(400, "tool_contract_mismatch")
        argument_hash = digest({"tool_id": tool_id, "arguments": body.arguments})
        old = self.store.call(run_id, body.call_id)
        if old:
            if old["argument_hash"] != argument_hash:
                raise HTTPException(409, "call_id_conflict")
            return {"call_id": body.call_id, "result": json.loads(old["result"]), "result_hash": old["result_hash"]}
        principal = Principal(kind="user", user_id=run["user_id"])
        handler = self.tools.search_public if tool_id == "blog.search_public" else self.tools.read_public
        try:
            result = handler(principal, body.arguments).model_dump()
        except Exception:
            raise HTTPException(400, "tool_input_or_resource_invalid") from None
        self.ensure_active(run_id)
        size = len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode())
        result_hash = digest(result)
        source = result if tool_id == "blog.read_public" else None
        if not self.store.save_call(run_id, body.call_id, argument_hash, result, result_hash, size, source):
            raise HTTPException(429, "tool_budget_exhausted")
        return {"call_id": body.call_id, "result": result, "result_hash": result_hash}

    async def model(self, run_id, body):
        await asyncio.to_thread(self.ensure_active, run_id)
        if not self.store.increment_model(run_id):
            raise HTTPException(429, "model_budget_exhausted")
        if self.model_proxy is None:
            raise HTTPException(503, "model_unavailable")
        task = asyncio.create_task(self.model_proxy({**body, "stream": False}))
        self.model_tasks.setdefault(run_id, set()).add(task)
        try:
            result = await asyncio.wait_for(task, timeout=30)
            await asyncio.to_thread(self.ensure_active, run_id)
            return result
        except asyncio.CancelledError:
            raise HTTPException(409, "model_request_cancelled") from None
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "model_proxy_failed") from None
        finally:
            self.model_tasks.get(run_id, set()).discard(task)

    def complete(self, run_id, result):
        run, _ = self.ensure_active(run_id)
        if result.get("error_code"):
            raise HTTPException(502, "model_or_worker_failed")
        turn_id = result.get("turn_id")
        if (
            result.get("finish") != "completed"
            or result.get("session_id") != "blog-qa-" + run_id
            or not isinstance(turn_id, str)
            or not turn_id.strip()
        ):
            raise HTTPException(502, "invalid_worker_terminal")
        answer, ids = result.get("answer"), result.get("sourceIds")
        if not isinstance(answer, str) or len(answer.encode()) > 32768 or not isinstance(ids, list):
            raise HTTPException(502, "invalid_answer")
        if re.search(r"\b[A-Za-z][\w+.-]*://|\bwww\.|</?[A-Za-z][^>]*>|\[[^\]]*\]\s*\(", answer):
            raise HTTPException(502, "answer_must_be_plain_text")
        if any(type(value) is not int for value in ids) or len(ids) != len(set(ids)):
            raise HTTPException(502, "invalid_sources")
        sources = self.store.sources(run_id)
        delivered = {s["article_id"]: s for s in sources if s["delivered"]}
        if any(article_id not in delivered for article_id in ids):
            raise HTTPException(502, "source_not_delivered")
        principal = Principal(kind="user", user_id=run["user_id"])
        for article_id in ids:
            try:
                current = self.tools.read_public(principal, {"article_id": article_id})
            except Exception:
                raise HTTPException(409, "source_changed") from None
            if current.content_hash != delivered[article_id]["content_hash"]:
                raise HTTPException(409, "source_changed")
        if not ids:
            searches = [r for r in self.store.results(run_id) if "items" in r]
            if not searches or any(r["items"] for r in searches):
                raise HTTPException(502, "answer_requires_sources")
            answer = "未找到相关公开文章"
        self.ensure_active(run_id)
        self.store.transition(run_id, "completed", answer=json.dumps({"text": answer, "sourceIds": ids}, ensure_ascii=False))

    def public_state(self, run_id):
        run = self.store.get(run_id)
        output = {"id": run["id"], "status": run["status"], "question": run["question"], "sources": []}
        if run["answer"]:
            answer = json.loads(run["answer"])
            output["answer"] = answer["text"]
            sources = {s["article_id"]: s for s in self.store.sources(run_id)}
            for article_id in answer["sourceIds"]:
                try:
                    article = self.tools.read_public(Principal(), {"article_id": article_id})
                except Exception:
                    continue
                if article.content_hash == sources[article_id]["content_hash"]:
                    output["sources"].append({"article_id": article_id, "title": sources[article_id]["title"],
                                              "url": self.article_url(article_id)})
        if run["error_code"]:
            output["error_code"] = run["error_code"]
        return output

    async def run_worker(self, run, payload):
        worker_dir = Path(os.environ["DSH_LOCAL_WORKER_DIR"]).resolve()
        node = Path(os.environ["DSH_LOCAL_NODE"]).resolve()
        workspace = worker_dir / "tmp" / ("run-" + run["id"])
        process = None
        try:
            process = await asyncio.create_subprocess_exec(
                "/usr/bin/sandbox-exec", "-f", str(worker_dir / "sandbox.sb"),
                str(node), str(worker_dir / "local-runner.mjs"), cwd=str(worker_dir),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
                env={"PATH": f"{node.parent}:/usr/bin:/bin", "HOME": str(worker_dir / "home"),
                     "TMPDIR": str(worker_dir / "tmp")}, limit=128 * 1024)
            process.stdin.write((json.dumps(payload) + "\n").encode())
            await process.stdin.drain()
            process.stdin.close()
            line = await process.stdout.readline()
            if len(line) > 128 * 1024:
                raise ValueError("worker_output_exceeded")
            result = json.loads(line)
            await process.wait()
            if process.returncode != 0:
                raise ValueError("worker_failed")
            return result
        finally:
            if process is not None:
                await self.stop_process(process)
            for _ in range(3):
                try:
                    if workspace.is_symlink():
                        workspace.unlink()
                    else:
                        shutil.rmtree(workspace, ignore_errors=False)
                    break
                except FileNotFoundError:
                    break
                except OSError:
                    await asyncio.sleep(.05)

    @staticmethod
    async def stop_process(process):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(process.wait(), 1)
        except asyncio.TimeoutError:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            await process.wait()
        # Kill descendants that outlived their original parent.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

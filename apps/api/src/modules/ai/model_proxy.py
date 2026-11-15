"""Structured Messages adaptation, independent from ordinary text chat."""

import asyncio
import json
import uuid

from .providers import OpenAiCompatibleProvider


def messages_to_openai(body: dict) -> list[dict]:
    messages = []
    system = body.get("system", [])
    if isinstance(system, str):
        system_text = system
    else:
        system_text = "\n".join(block.get("text", "") for block in system if block.get("type") == "text")
    if system_text:
        messages.append({"role": "system", "content": system_text})
    for message in body.get("messages", []):
        role = message["role"]
        if role not in {"user", "assistant"}:
            raise ValueError("Unsupported model role")
        blocks = message.get("content", [])
        if isinstance(blocks, str):
            messages.append({"role": role, "content": blocks})
            continue
        text = "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text")
        calls = [block for block in blocks if block.get("type") == "tool_use"]
        results = [block for block in blocks if block.get("type") == "tool_result"]
        if text or calls:
            row = {"role": role, "content": text or None}
            if calls:
                if role != "assistant":
                    raise ValueError("Invalid tool call role")
                row["tool_calls"] = [{
                    "id": call["id"], "type": "function",
                    "function": {"name": call["name"], "arguments": json.dumps(call["input"], ensure_ascii=False)},
                } for call in calls]
            messages.append(row)
        for result in results:
            if role != "user":
                raise ValueError("Invalid tool result role")
            content = result.get("content", "")
            if isinstance(content, list):
                content = "\n".join(block.get("text", "") for block in content if block.get("type") == "text")
            messages.append({"role": "tool", "tool_call_id": result["tool_use_id"], "content": content})
    return messages


def response_to_messages(body: dict, model: str = "qwen38_27b") -> dict:
    choice = body["choices"][0]
    message = choice["message"]
    reason = choice.get("finish_reason")
    if reason not in {"stop", "tool_calls", "length"}:
        raise ValueError("Unsupported model stop reason")
    blocks = []
    if message.get("content"):
        blocks.append({"type": "text", "text": message["content"]})
    for call in message.get("tool_calls", []):
        arguments = json.loads(call["function"]["arguments"])
        if not isinstance(arguments, dict):
            raise ValueError("Invalid tool arguments")
        blocks.append({"type": "tool_use", "id": call["id"], "name": call["function"]["name"], "input": arguments})
    usage = body.get("usage", {})
    return {
        "id": body.get("id", f"msg_{uuid.uuid4().hex}"), "type": "message", "role": "assistant",
        "model": model, "content": blocks,
        "stop_reason": {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens"}[reason],
        "stop_sequence": None,
        "usage": {"input_tokens": int(usage.get("prompt_tokens", 0)), "output_tokens": int(usage.get("completion_tokens", 0))},
    }


class StructuredModelProxy:
    """One reviewed global model configuration, pinned for this runtime."""

    def __init__(self, config):
        self.config = config
        self.model_label = config.model

    async def __call__(self, body: dict) -> dict:
        provider = OpenAiCompatibleProvider(
            self.config, total_timeout_seconds=30, read_timeout_seconds=30,
            max_output_tokens=1024, max_stream_bytes=256 * 1024,
        )
        options = await provider._connection_options(provider._endpoint())
        client = provider._build_http_client(provider._load_dependencies(), options)
        tools = body.get("tools", [])
        if len(tools) != 2 or {tool["name"] for tool in tools} != {"blog_search_public", "blog_read_public"}:
            raise ValueError("Invalid tools")
        payload = {
            "model": self.config.model, "messages": messages_to_openai(body), "stream": False,
            "max_tokens": 1024, "temperature": 0,
            "tools": [{"type": "function", "function": {
                "name": tool["name"], "description": tool.get("description", ""),
                "parameters": tool["input_schema"],
            }} for tool in tools],
        }
        async with asyncio.timeout(30), client:
            response = await client.post(options.endpoint, json=payload)
            if response.status_code != 200:
                raise RuntimeError("Model request failed")
            return response_to_messages(response.json(), self.config.model)

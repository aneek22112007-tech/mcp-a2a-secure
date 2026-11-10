"""Speak MCP over a process's stdin and stdout.

The official filesystem server accepts a 2025-era ``initialize`` handshake
on newline-delimited JSON. A Content-Length frame is accepted as well, in
case a build of the server uses the older stdio framing.
"""

from __future__ import annotations

import json
from typing import Any

from app.sandbox.errors import SandboxOutputError, SandboxToolError
from app.sandbox.types import ERROR_PROTOCOL_ERROR


class StdioMcp:
    """One MCP session on an already started process."""

    def __init__(self, stdin: Any, stdout: Any) -> None:
        self._stdin = stdin
        self._stdout = stdout
        self._next_id = 1
        self._content_length = False

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        message_id = self._next_id
        self._next_id += 1
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": message_id,
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        await self._write(payload)
        while True:
            message = await self._read()
            if not isinstance(message, dict):
                raise SandboxToolError(ERROR_PROTOCOL_ERROR)
            if message.get("id") == message_id and "method" not in message:
                if "error" in message:
                    raise SandboxToolError(ERROR_PROTOCOL_ERROR)
                return message.get("result")
            if "method" in message and "id" in message:
                await self._write(
                    {
                        "jsonrpc": "2.0",
                        "id": message["id"],
                        "error": {"code": -32601, "message": "Method not found"},
                    }
                )

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        await self._write(payload)

    async def _write(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        if self._content_length:
            frame = b"Content-Length: " + str(len(body)).encode("ascii") + b"\r\n\r\n"
            self._stdin.write(frame + body)
        else:
            self._stdin.write(body + b"\n")
        await self._stdin.drain()

    async def _read(self) -> Any:
        try:
            line = await self._stdout.readline()
        except ValueError:
            # The line is longer than the reader limit, so the tool output is
            # over the sandbox output cap.
            raise SandboxOutputError() from None
        if not line:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        if line.lower().startswith(b"content-length:"):
            self._content_length = True
            length = _content_length(line)
            while True:
                header = await self._stdout.readline()
                if not header:
                    raise SandboxToolError(ERROR_PROTOCOL_ERROR)
                if header in (b"\r\n", b"\n"):
                    break
                if header.lower().startswith(b"content-length:"):
                    length = _content_length(header)
            body = await self._stdout.readexactly(length)
            return _loads(body)
        return _loads(line)


def _content_length(line: bytes) -> int:
    try:
        return int(line.split(b":", 1)[1].strip())
    except (IndexError, ValueError):
        raise SandboxToolError(ERROR_PROTOCOL_ERROR) from None


def _loads(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SandboxToolError(ERROR_PROTOCOL_ERROR) from None

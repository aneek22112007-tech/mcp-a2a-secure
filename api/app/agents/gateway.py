"""HTTP client for MCP Guard's /mcp/ endpoint.

The notes agent uses this client. It does not call the in-process tool
functions. One request is sent per step. A 401, 403, or 429 is returned
to the caller and is not retried. Redirects are not followed, so the
bearer token stays on this host.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Self

import httpx

from app.audit.redaction import safe_reason
from app.config import settings

_BLOCKED_STATUS = frozenset({401, 403, 429})
_MAX_TOOL_TEXT = 4_000
_PROTOCOL_VERSION = "2025-06-18"


class GatewayError(Exception):
    """A gateway call failed. ``message`` is safe to show to a client."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class GatewayBlockedError(GatewayError):
    """Auth, scope, or rate limit rejected the call. Do not retry."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


class GatewayHTTPError(GatewayError):
    """The gateway returned an HTTP error that is not a block."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


class GatewayTransportError(GatewayError):
    """The gateway could not be reached or timed out."""


class GatewayProtocolError(GatewayError):
    """The gateway answered, but the body was not a usable MCP response."""


@dataclass(frozen=True, slots=True)
class GatewayToolResult:
    ok: bool
    text: str


class McpGatewaySession:
    """One Streamable HTTP session against ``/mcp/``."""

    def __init__(
        self,
        url: str,
        api_key: str,
        *,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = _mcp_url(url)
        self._timeout = timeout if timeout is not None else _gateway_timeout()
        self._transport = transport
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._client: httpx.AsyncClient | None = None
        self._next_id = 1

    async def __aenter__(self) -> Self:
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            transport=self._transport,
            follow_redirects=False,
        )
        try:
            await self._initialize()
        except Exception:
            await self._client.aclose()
            self._client = None
            raise
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def call_tool(
        self, name: str, arguments: dict[str, Any]
    ) -> GatewayToolResult:
        """Send one ``tools/call``. A block raises and is not sent again."""

        response = await self._post(
            {
                "jsonrpc": "2.0",
                "id": self._take_id(),
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        return _tool_result(_rpc_payload(response))

    async def _initialize(self) -> None:
        response = await self._post(
            {
                "jsonrpc": "2.0",
                "id": self._take_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": _PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": "mcp-guard-notes-agent",
                        "version": "0.1.0",
                    },
                },
            }
        )
        session_id = response.headers.get("mcp-session-id")
        if not session_id:
            raise GatewayProtocolError("The gateway did not return a session id.")
        self._headers["mcp-session-id"] = session_id
        await self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        if self._client is None:
            raise GatewayTransportError("The gateway session is not open.")
        try:
            response = await self._client.post(
                self._url,
                headers=self._headers,
                json=payload,
            )
        except httpx.TimeoutException as exc:
            raise GatewayTransportError("The gateway timed out.") from exc
        except httpx.HTTPError as exc:
            raise GatewayTransportError("The gateway could not be reached.") from exc
        if response.status_code in _BLOCKED_STATUS:
            raise GatewayBlockedError(response.status_code, _public_message(response))
        if response.status_code >= 400:
            raise GatewayHTTPError(response.status_code, _public_message(response))
        return response

    def _take_id(self) -> int:
        request_id = self._next_id
        self._next_id += 1
        return request_id


def _gateway_timeout() -> float:
    return max(10.0, float(settings.tool_timeout_s) + 5.0)


def _mcp_url(url: str) -> str:
    text = url.strip()
    if not text.endswith("/"):
        text += "/"
    return text


def _public_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return "The gateway rejected the call."
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return safe_reason(error["message"]) or "The gateway rejected the call."
    return "The gateway rejected the call."


def _rpc_payload(response: httpx.Response) -> dict[str, Any]:
    content_type = response.headers.get("content-type", "").lower()
    raw = response.text
    if "text/event-stream" in content_type or raw.startswith(("event:", "data:")):
        payload = _sse_json(raw)
        if payload is None:
            raise GatewayProtocolError(
                "The gateway returned an unreadable event stream."
            )
        return payload
    try:
        body = response.json()
    except ValueError as exc:
        raise GatewayProtocolError(
            "The gateway returned an unreadable response."
        ) from exc
    if not isinstance(body, dict):
        raise GatewayProtocolError("The gateway returned an unreadable response.")
    return body


def _sse_json(raw: str) -> dict[str, Any] | None:
    blocks: list[str] = []
    current: list[str] = []
    for line in raw.splitlines():
        if line.startswith("data:"):
            current.append(line[5:].lstrip())
        elif line == "" and current:
            blocks.append("\n".join(current))
            current = []
    if current:
        blocks.append("\n".join(current))
    for block in reversed(blocks):
        if not block or block == "[DONE]":
            continue
        try:
            payload = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    return None


def _tool_result(payload: dict[str, Any]) -> GatewayToolResult:
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        text = message if isinstance(message, str) else "The tool call failed."
        return GatewayToolResult(
            ok=False, text=_clip(safe_reason(text) or "The tool call failed.")
        )
    result = payload.get("result")
    if not isinstance(result, dict):
        raise GatewayProtocolError("The gateway returned an unreadable tool result.")
    text = _clip(_content_text(result.get("content")))
    if not text and result.get("structuredContent") is not None:
        try:
            text = _clip(json.dumps(result["structuredContent"]))
        except (TypeError, ValueError):
            text = ""
    if not text:
        text = "(empty)"
    return GatewayToolResult(ok=not bool(result.get("isError")), text=text)


def _content_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and isinstance(block.get("text"), str):
            parts.append(block["text"])
    return "\n".join(parts).strip()


def _clip(text: str) -> str:
    if len(text) <= _MAX_TOOL_TEXT:
        return text
    return text[:_MAX_TOOL_TEXT] + "\n[truncated]"

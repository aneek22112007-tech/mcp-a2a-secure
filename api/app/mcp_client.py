import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

URL = "http://localhost:8000/mcp/"


@asynccontextmanager
async def connect(url: str, timeout: float = 30, headers: dict[str, str] | None = None) -> AsyncIterator[ClientSession]:
    """Open a Streamable HTTP MCP session that the caller can initialize."""
    client = httpx.AsyncClient(timeout=timeout, headers=headers)
    try:
        async with (
            streamable_http_client(url, http_client=client) as (read, write, _),
            ClientSession(
                read,
                write,
                read_timeout_seconds=timedelta(seconds=timeout),
            ) as session,
        ):
            yield session
    finally:
        await client.aclose()


async def main() -> None:
    async with connect(URL) as session:
        await session.initialize()
        tools = await session.list_tools()
        print("tools:", [tool.name for tool in tools.tools])
        print(
            await session.call_tool("write_note", {"name": "demo", "content": "hello"})
        )
        print(await session.call_tool("read_note", {"name": "demo"}))


if __name__ == "__main__":
    asyncio.run(main())

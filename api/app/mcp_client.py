import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

URL = "http://localhost:8000/mcp/"


@asynccontextmanager
async def connect(url: str, timeout: float = 30) -> AsyncIterator[ClientSession]:
    """Open a Streamable HTTP MCP session that the caller can initialize."""
    async with (
        streamablehttp_client(
            url,
            timeout=timeout,
            sse_read_timeout=timeout,
        ) as (read, write, _),
        ClientSession(
            read,
            write,
            read_timeout_seconds=timedelta(seconds=timeout),
        ) as session,
    ):
        yield session


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

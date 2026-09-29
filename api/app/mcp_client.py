import asyncio

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

URL = "http://localhost:8000/mcp/"

async def main():
    async with streamablehttp_client(URL) as (read, write, _), ClientSession(read, write) as s:
            await s.initialize()
            tools = await s.list_tools()
            print("tools:", [t.name for t in tools.tools])
            print(await s.call_tool("write_note", {"name": "demo", "content": "hello"}))
            print(await s.call_tool("read_note", {"name": "demo"}))

if __name__ == "__main__":
    asyncio.run(main())

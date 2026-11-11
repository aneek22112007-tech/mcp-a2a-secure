"""Unit tests for the generic upstream registry.

Verifies UpstreamSpec registration, tool discovery, metadata extraction,
hostile input rejection, authority boundary enforcement, status reporting,
and filesystem compatibility wrappers.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from mcp.types import CallToolResult

from app.auth.scopes import TOOL_SCOPES
from app.main import app  # noqa: F401
from app.sandbox.errors import (
    SandboxBusyError,
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
)
from app.upstream.filesystem import (
    CONTRACT_CHANGED,
    FILESYSTEM,
    FILESYSTEM_SPEC,
    MOUNT,
    PREFIX,
    READ_ONLY_TOOLS,
    UPSTREAM_ERROR_PREFIX,
    WRITE_TOOLS,
    FilesystemTool,
    check_paths,
    contract_fingerprint,
    ensure_shared_dir,
    filesystem_status,
    filesystem_tool,
    is_filesystem_tool,
    register_filesystem_upstream,
)
from app.upstream.registry import (
    RegisteredTool,
    _invoke,
    _PassthroughArgs,
    all_specs,
    get_spec,
    is_upstream_tool,
    register_spec,
    register_upstream,
    register_upstreams,
    reset_registry,
    spec_for,
    upstream_status,
    upstream_tool,
)
from app.upstream.spec import UpstreamSpec

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def _isolate_registry():
    """Ensure registry test isolation and restore the filesystem spec."""
    reset_registry()
    register_spec(FILESYSTEM)
    yield
    reset_registry()
    register_spec(FILESYSTEM)


def _make_spec(**overrides: Any) -> UpstreamSpec:
    defaults: dict[str, Any] = {
        "id": "mock_upstream",
        "prefix": "mock_",
        "label": "mock upstream",
        "enabled": lambda: True,
        "image": lambda: "mock-image:latest",
        "timeout_s": lambda: 10.0,
        "container_name_prefix": "mcpg-mock-",
        "scope_for": lambda name: "mock:read" if name == "reader" else None,
        "read_only_for": lambda name: name != "writer",
    }
    defaults.update(overrides)
    return UpstreamSpec(**defaults)


def test_registered_tool_attributes_and_immutability():
    tool = RegisteredTool(
        spec_id="test_spec",
        upstream_name="test_tool",
        public_name="prefix_test_tool",
        read_only=True,
        fingerprint="sha256:abc123",
    )
    assert tool.spec_id == "test_spec"
    assert tool.upstream_name == "test_tool"
    assert tool.public_name == "prefix_test_tool"
    assert tool.read_only is True
    assert tool.fingerprint == "sha256:abc123"

    with pytest.raises(FrozenInstanceError):
        tool.read_only = False  # type: ignore[misc]

    with pytest.raises(FrozenInstanceError):
        tool.fingerprint = "new_hash"  # type: ignore[misc]


def test_register_spec_and_spec_retrieval():
    spec = _make_spec(id="custom_spec", prefix="custom_")
    register_spec(spec)

    assert get_spec("custom_spec") is spec
    assert get_spec("non_existent") is None
    assert spec in all_specs()
    assert FILESYSTEM in all_specs()

    # spec_for lookup by prefix when tools are not yet registered
    assert spec_for("custom_something") is spec
    assert spec_for("unknown_prefix_tool") is None


async def test_register_upstream_success_and_metadata():
    spec = _make_spec(
        id="demo",
        prefix="demo_",
        scope_for=lambda name: "demo:write" if name == "writer" else "demo:read",
        read_only_for=lambda name: name != "writer",
    )

    async def mock_discover() -> list[dict[str, Any]]:
        return [
            {
                "name": "reader",
                "description": "Reads data",
                "inputSchema": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                },
            },
            {
                "name": "writer",
                "description": "Writes data",
                "inputSchema": {
                    "type": "object",
                    "properties": {"data": {"type": "string"}},
                },
            },
        ]

    await register_upstream(spec, discover_fn=mock_discover)

    # Tool lookup
    reader_tool = upstream_tool("demo_reader")
    assert reader_tool is not None
    assert reader_tool.spec_id == "demo"
    assert reader_tool.upstream_name == "reader"
    assert reader_tool.public_name == "demo_reader"
    assert reader_tool.read_only is True
    assert len(reader_tool.fingerprint) == 64

    writer_tool = upstream_tool("demo_writer")
    assert writer_tool is not None
    assert writer_tool.spec_id == "demo"
    assert writer_tool.upstream_name == "writer"
    assert writer_tool.public_name == "demo_writer"
    assert writer_tool.read_only is False
    assert len(writer_tool.fingerprint) == 64

    assert is_upstream_tool("demo_reader") is True
    assert is_upstream_tool("demo_writer") is True
    assert is_upstream_tool("demo_unknown") is False

    # Scope mapping
    assert TOOL_SCOPES.get("demo_reader") == "demo:read"
    assert TOOL_SCOPES.get("demo_writer") == "demo:write"

    # Status check
    status = upstream_status(spec)
    assert status == {
        "id": "demo",
        "enabled": True,
        "image": "mock-image:latest",
        "available": True,
        "tool_count": 2,
        "tools": ["demo_reader", "demo_writer"],
        "detail": "ok",
    }


async def test_register_upstream_hostile_input_filtering():
    """Verify that malformed or hostile tool definitions are safely dropped."""
    spec = _make_spec(id="hostile_test", prefix="sec_")

    async def mock_hostile_discover() -> list[dict[str, Any]]:
        return [
            "not a dict",  # type: ignore[list-item]
            12345,  # type: ignore[list-item]
            None,  # type: ignore[list-item]
            {},  # missing name
            {"name": 42, "description": "d", "inputSchema": {}},  # non-string name
            {"name": "tool with spaces", "description": "d", "inputSchema": {}},
            {"name": "tool-hyphen", "description": "d", "inputSchema": {}},
            {"name": "123numeric_start", "description": "d", "inputSchema": {}},
            {"name": "_private_underscore", "description": "d", "inputSchema": {}},
            {"name": "__dunder_tool", "description": "d", "inputSchema": {}},
            {"name": "valid_no_desc", "inputSchema": {}},  # missing desc
            {
                "name": "valid_bad_desc",
                "description": ["list"],
                "inputSchema": {},
            },  # non-string desc
            {"name": "valid_no_schema", "description": "d"},  # missing schema
            {
                "name": "valid_bad_schema",
                "description": "d",
                "inputSchema": "not a dict",
            },  # non-dict schema
            {
                "name": "safe_tool",
                "description": "A completely valid tool",
                "inputSchema": {"type": "object"},
            },
        ]

    await register_upstream(spec, discover_fn=mock_hostile_discover)

    # Only safe_tool should have survived
    assert is_upstream_tool("sec_safe_tool") is True
    assert upstream_tool("sec_safe_tool") is not None

    status = upstream_status(spec)
    assert status["available"] is True
    assert status["tool_count"] == 1
    assert status["tools"] == ["sec_safe_tool"]


async def test_authority_spec_controls_scope_and_read_only():
    """Security boundary: Upstream payloads cannot grant themselves scopes or elevation."""
    spec = _make_spec(
        id="auth_test",
        prefix="auth_",
        scope_for=lambda name: "authorized:read" if name == "trusted_tool" else None,
        read_only_for=lambda name: name != "allowed_writer",
    )

    async def mock_elevation_discover() -> list[dict[str, Any]]:
        return [
            {
                "name": "trusted_tool",
                "description": "Trusted tool trying to claim root/write",
                # Attacking payload attempts to claim write permissions
                "read_only": False,
                "scope": "admin:superuser",
                "annotations": {"readOnly": False, "role": "root"},
                "inputSchema": {"type": "object"},
            },
            {
                "name": "unmapped_tool",
                "description": "Unmapped tool trying to claim scopes",
                "scope": "authorized:write",
                "inputSchema": {"type": "object"},
            },
        ]

    await register_upstream(spec, discover_fn=mock_elevation_discover)

    # trusted_tool must obey spec.scope_for and spec.read_only_for, NOT upstream dict
    trusted = upstream_tool("auth_trusted_tool")
    assert trusted is not None
    assert trusted.read_only is True  # Enforced by spec.read_only_for
    assert TOOL_SCOPES.get("auth_trusted_tool") == "authorized:read"

    # unmapped_tool gets NO scope (fail-closed)
    unmapped = upstream_tool("auth_unmapped_tool")
    assert unmapped is not None
    assert unmapped.read_only is True
    assert "auth_unmapped_tool" not in TOOL_SCOPES


async def test_register_upstream_disabled():
    spec = _make_spec(id="disabled_upstream", enabled=lambda: False)
    discover_called = False

    async def mock_discover():
        nonlocal discover_called
        discover_called = True
        return []

    await register_upstream(spec, discover_fn=mock_discover)
    assert discover_called is False

    status = upstream_status(spec)
    assert status["enabled"] is False
    assert status["available"] is False
    assert status["tool_count"] == 0
    assert status["detail"] == "disabled"


async def test_register_upstream_discovery_failures():
    spec = _make_spec(id="failing_upstream")

    # 1. SandboxUnavailableError
    async def mock_fail_unavailable():
        raise SandboxUnavailableError()

    await register_upstream(spec, discover_fn=mock_fail_unavailable)
    status = upstream_status(spec)
    assert status["available"] is False
    assert status["detail"] == "unavailable"

    # 2. Generic Exception
    async def mock_fail_generic():
        raise RuntimeError("Docker communication crashed")

    await register_upstream(spec, discover_fn=mock_fail_generic)
    status = upstream_status(spec)
    assert status["available"] is False
    assert status["detail"] == "unavailable"

    # 3. Empty tools list
    async def mock_empty():
        return []

    await register_upstream(spec, discover_fn=mock_empty)
    status = upstream_status(spec)
    assert status["available"] is False
    assert status["tool_count"] == 0


async def test_upstream_dispatch_and_error_handling():
    spec = _make_spec(id="dispatch_test", label="dispatch upstream")

    # Test ValueError
    with patch(
        "app.sandbox.executor.run_tool",
        new=AsyncMock(side_effect=ValueError("Invalid path")),
    ):
        res: CallToolResult = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert res.content[0].text == f"{UPSTREAM_ERROR_PREFIX}Invalid path"

    # Test SandboxTimeoutError
    with patch(
        "app.sandbox.executor.run_tool", new=AsyncMock(side_effect=SandboxTimeoutError)
    ):
        res = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert (
            res.content[0].text
            == f"{UPSTREAM_ERROR_PREFIX}The dispatch upstream tool timed out."
        )

    # Test SandboxOutputError
    with patch(
        "app.sandbox.executor.run_tool", new=AsyncMock(side_effect=SandboxOutputError)
    ):
        res = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert (
            res.content[0].text
            == f"{UPSTREAM_ERROR_PREFIX}The dispatch upstream tool output is too large."
        )

    # Test SandboxBusyError
    with patch(
        "app.sandbox.executor.run_tool", new=AsyncMock(side_effect=SandboxBusyError)
    ):
        res = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert (
            res.content[0].text
            == f"{UPSTREAM_ERROR_PREFIX}The dispatch upstream tool is busy."
        )

    # Test SandboxUnavailableError
    with patch(
        "app.sandbox.executor.run_tool",
        new=AsyncMock(side_effect=SandboxUnavailableError),
    ):
        res = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert (
            res.content[0].text
            == f"{UPSTREAM_ERROR_PREFIX}The dispatch upstream upstream is unavailable."
        )

    # Test SandboxToolError
    with patch(
        "app.sandbox.executor.run_tool", new=AsyncMock(side_effect=SandboxToolError)
    ):
        res = await _invoke(spec, "mock_tool", {}, None)
        assert res.isError is True
        assert (
            res.content[0].text
            == f"{UPSTREAM_ERROR_PREFIX}The dispatch upstream tool failed."
        )


def test_contract_fingerprint_and_passthrough_args():
    fp1 = contract_fingerprint("tool", "desc", {"type": "object"})
    fp2 = contract_fingerprint("tool", "desc", {"type": "object"})
    fp3 = contract_fingerprint("tool", "different desc", {"type": "object"})

    assert fp1 == fp2
    assert fp1 != fp3
    assert len(fp1) == 64

    args = _PassthroughArgs.model_validate({"custom_key": "custom_val", "ctx": "skip"})
    dumped = args.model_dump_one_level()
    assert dumped["custom_key"] == "custom_val"


def test_filesystem_compatibility_exports():
    """Verify that all public exports and compatibility wrappers of filesystem.py remain intact."""
    assert FilesystemTool is RegisteredTool
    assert FILESYSTEM is FILESYSTEM_SPEC
    assert FILESYSTEM.id == "filesystem"
    assert FILESYSTEM.prefix == PREFIX
    assert PREFIX == "fs_"
    assert MOUNT == "/projects"
    assert "read_file" in READ_ONLY_TOOLS
    assert "write_file" in WRITE_TOOLS
    assert CONTRACT_CHANGED.startswith(UPSTREAM_ERROR_PREFIX)
    assert callable(check_paths)
    assert callable(ensure_shared_dir)
    assert callable(register_filesystem_upstream)
    assert callable(filesystem_status)
    assert callable(filesystem_tool)
    assert callable(is_filesystem_tool)

    # Status before registration
    status = filesystem_status()
    assert status["id"] == "filesystem"
    assert "enabled" in status
    assert "image" in status
    assert "available" in status
    assert "tool_count" in status
    assert "tools" in status
    assert "detail" in status


async def test_filesystem_status_and_tool_wrappers_with_mock(monkeypatch):
    """Verify is_filesystem_tool and filesystem_tool via the compatibility wrappers."""
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_enabled", True)
    spec = FILESYSTEM

    async def mock_fs_discover():
        return [
            {
                "name": "read_text_file",
                "description": "Read file",
                "inputSchema": {"type": "object"},
            },
            {
                "name": "write_file",
                "description": "Write file",
                "inputSchema": {"type": "object"},
            },
        ]

    await register_upstream(spec, discover_fn=mock_fs_discover)

    assert is_filesystem_tool("fs_read_text_file") is True
    assert is_filesystem_tool("fs_write_file") is True
    assert is_filesystem_tool("fs_unknown") is False
    assert is_filesystem_tool("non_fs_tool") is False

    tool = filesystem_tool("fs_read_text_file")
    assert tool is not None
    assert isinstance(tool, FilesystemTool)
    assert tool.spec_id == "filesystem"
    assert tool.upstream_name == "read_text_file"
    assert tool.public_name == "fs_read_text_file"
    assert tool.read_only is True

    status = filesystem_status()
    assert status["available"] is True
    assert status["tool_count"] == 2
    assert "fs_read_text_file" in status["tools"]
    assert "fs_write_file" in status["tools"]


async def test_register_upstreams_iterates_specs():
    spec1 = _make_spec(id="spec1", prefix="s1_")
    spec2 = _make_spec(id="spec2", prefix="s2_")
    register_spec(spec1)
    register_spec(spec2)

    with patch(
        "app.upstream.registry.register_upstream", new=AsyncMock()
    ) as mock_reg_up:
        await register_upstreams()
        called_specs = [call.args[0] for call in mock_reg_up.call_args_list]
        assert spec1 in called_specs
        assert spec2 in called_specs
        assert FILESYSTEM in called_specs

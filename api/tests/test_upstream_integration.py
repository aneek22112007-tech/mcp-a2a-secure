"""Integration tests for generic upstream registry, runner, executor, and routes.

Verifies:
- Sandbox executor resolves UpstreamSpec via spec_for() and dispatches to get_upstream_executor(spec).
- Filesystem tool execution remains compatible.
- Startup invokes generic register_upstreams().
- /api/upstreams route iterates over all_specs() and returns upstream_status(spec).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sandbox.errors import SandboxToolError
from app.sandbox.executor import run_tool
from app.sandbox.types import ERROR_TOOL_NOT_FOUND
from app.upstream.filesystem import FILESYSTEM
from app.upstream.registry import (
    RegisteredTool,
    all_specs,
    contract_fingerprint,
    register_spec,
    reset_registry,
    spec_for,
)
from app.upstream.runner import get_upstream_executor
from app.upstream.spec import UpstreamSpec

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def _isolate_state():
    reset_registry()
    register_spec(FILESYSTEM)
    yield
    reset_registry()
    register_spec(FILESYSTEM)


def _make_spec(spec_id: str, prefix: str) -> UpstreamSpec:
    return UpstreamSpec(
        id=spec_id,
        prefix=prefix,
        label=f"{spec_id} upstream",
        enabled=lambda: True,
        image=lambda: f"{spec_id}-image:latest",
        timeout_s=lambda: 15.0,
        container_name_prefix=f"mcpg-{spec_id}-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )


async def test_sandbox_executor_resolves_generic_spec_and_executor():
    """Verify sandbox executor resolves tool's spec via spec_for and uses get_upstream_executor."""
    spec = _make_spec("custom_plugin", "plug_")
    register_spec(spec)

    assert spec_for("plug_action") is spec

    # Register the tool in the registry
    from app.upstream.registry import _tools

    fp = contract_fingerprint("plug_action", "Action desc", {"type": "object"})
    _tools["plug_action"] = RegisteredTool(
        spec_id="custom_plugin",
        upstream_name="action",
        public_name="plug_action",
        read_only=True,
        fingerprint=fp,
    )

    mock_executor = get_upstream_executor(spec)
    mock_run = AsyncMock(return_value="executed_custom_tool_result")

    with patch.object(mock_executor, "execute", new=mock_run):
        result = await run_tool("plug_action", {"input": "test_value"})
        assert result == "executed_custom_tool_result"
        assert mock_run.called
        args_passed = mock_run.call_args[0]
        assert args_passed[0] == "plug_action"
        assert args_passed[1] == {"input": "test_value"}


async def test_sandbox_executor_filesystem_tool_compatibility(monkeypatch):
    """Verify existing filesystem tool dispatching remains completely compatible."""
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_enabled", True)
    from app.upstream.registry import _tools

    fp = contract_fingerprint("fs_read_text_file", "Read text", {"type": "object"})
    _tools["fs_read_text_file"] = RegisteredTool(
        spec_id="filesystem",
        upstream_name="read_text_file",
        public_name="fs_read_text_file",
        read_only=True,
        fingerprint=fp,
    )

    fs_executor = get_upstream_executor(FILESYSTEM)
    mock_fs_run = AsyncMock(return_value="filesystem_file_content")

    with patch.object(fs_executor, "execute", new=mock_fs_run):
        result = await run_tool("fs_read_text_file", {"path": "test.txt"})
        assert result == "filesystem_file_content"
        assert mock_fs_run.called
        assert mock_fs_run.call_args[0][0] == "fs_read_text_file"
        assert mock_fs_run.call_args[0][1] == {"path": "test.txt"}


async def test_sandbox_executor_unregistered_tool_rejection():
    """Verify that calling an unregistered tool rejected by both upstream and in-process policies."""
    with pytest.raises(SandboxToolError) as exc_info:
        await run_tool("completely_unknown_tool", {})
    assert exc_info.value.error_type == ERROR_TOOL_NOT_FOUND


async def test_startup_invokes_register_upstreams():
    """Verify lifespan startup executes register_upstreams() to discover all upstreams."""
    with patch(
        "app.upstream.registry.register_upstreams", new=AsyncMock()
    ) as mock_reg_all:
        from app.main import lifespan

        # Run lifespan generator startup phase
        async with lifespan(app):
            assert mock_reg_all.called


def test_routes_upstreams_lists_all_registered_specs():
    """Verify GET /api/upstreams reports statuses for all registered specs dynamically."""
    client = TestClient(app, base_url="http://localhost:8000")

    # 1. Initially reports the filesystem spec
    resp1 = client.get("/api/upstreams", headers={"Authorization": "Bearer mcpg_admin"})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert isinstance(data1, list)
    spec_ids1 = [item["id"] for item in data1]
    assert "filesystem" in spec_ids1

    # Verify standard schema on filesystem entry
    fs_entry = next(item for item in data1 if item["id"] == "filesystem")
    assert "id" in fs_entry
    assert "enabled" in fs_entry
    assert "image" in fs_entry
    assert "available" in fs_entry
    assert "tool_count" in fs_entry
    assert "tools" in fs_entry
    assert "detail" in fs_entry

    # 2. Register an additional spec
    lab_spec = _make_spec("demo_spec", "demo_")
    register_spec(lab_spec)
    assert lab_spec in all_specs()

    resp2 = client.get("/api/upstreams", headers={"Authorization": "Bearer mcpg_admin"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    spec_ids2 = [item["id"] for item in data2]
    assert "filesystem" in spec_ids2
    assert "demo_spec" in spec_ids2

    demo_entry = next(item for item in data2 if item["id"] == "demo_spec")
    assert demo_entry["image"] == "demo_spec-image:latest"
    assert demo_entry["enabled"] is True


def test_routes_upstreams_unauthorized():
    """Verify GET /api/upstreams rejects unauthenticated or unauthorized requests."""
    client = TestClient(app, base_url="http://localhost:8000")
    resp = client.get("/api/upstreams")
    assert resp.status_code in (401, 403)

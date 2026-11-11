from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import app  # noqa: F401
from app.sandbox.context import ExecutionContext
from app.sandbox.errors import (
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxUnavailableError,
    SandboxUpstreamError,
)
from app.sandbox.types import (
    ERROR_DOCKER_UNAVAILABLE,
    ERROR_IMAGE_MISSING,
    ERROR_UPSTREAM,
)
from app.upstream.filesystem import (
    CONTRACT_CHANGED,
    FILESYSTEM,
    MOUNT,
    UPSTREAM_ERROR_PREFIX,
    check_paths,
)
from app.upstream.registry import (
    RegisteredTool,
    contract_fingerprint,
    register_spec,
    reset_registry,
)
from app.upstream.runner import (
    FilesystemExecutor,
    FilesystemSession,
    UpstreamExecutor,
    UpstreamSession,
    _argv,
    _content_text,
    _raise_startup,
    discover_filesystem_tools,
    discover_tools,
    get_filesystem_executor,
    get_upstream_executor,
)
from app.upstream.spec import UpstreamSpec

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def _isolate_upstream_state():
    yield
    reset_registry()
    register_spec(FILESYSTEM)


def _dummy_context() -> ExecutionContext:
    return ExecutionContext(
        transport="rest",
        request_id="req-test-123",
        client_id="client-test",
        api_key_id="key-test",
        key_prefix="mcpg_test",
        audit_event_id="evt-1",
    )


def test_upstream_fs_source_valid_configuration():
    valid_sources = [
        "volume:mcpg_shared",
        "volume:my-volume",
        "volume:vol.1_test",
        "volume:a",
        "volume:UPSTREAM_FS_DATA",
    ]
    for src in valid_sources:
        settings = Settings(upstream_fs_source=src, _env_file=None)
        assert settings.upstream_fs_source == src


def test_upstream_fs_source_invalid_configuration():
    invalid_sources = [
        "volume:",  # empty volume name
        "mcpg_shared",  # missing volume: prefix
        "/var/run/shared",  # host path
        "relative/path",
        "volume:invalid/name",  # slashes
        "volume:invalid:name",  # extra colon
        "volume:invalid;name",  # semicolon
        "volume:name$var",  # special char
    ]
    for src in invalid_sources:
        with pytest.raises(ValidationError):
            Settings(upstream_fs_source=src, _env_file=None)


def test_upstream_fs_source_injection_rejected():
    injection_sources = [
        "volume:shared,readonly",  # comma injection
        "volume:shared\n",  # newline injection
        "volume:shared\r",  # carriage return
        "volume:shared=other",  # equals option injection
        "volume:shared name",  # whitespace
        "volume:shared\tro",  # tab
        "volume:shared;rm -rf /",  # command separator
    ]
    for src in injection_sources:
        with pytest.raises(ValidationError):
            Settings(upstream_fs_source=src, _env_file=None)


def test_upstream_fs_source_blank_converts_to_none():
    settings = Settings(upstream_fs_source="", _env_file=None)
    assert settings.upstream_fs_source is None

    settings_spaces = Settings(upstream_fs_source="   ", _env_file=None)
    assert settings_spaces.upstream_fs_source is None


def test_argv_named_volume_mount_readonly(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_source", "volume:mcpg_shared")
    argv = _argv("run-ro-test", read_only=True)

    mount_idx = argv.index("--mount")
    mount_arg = argv[mount_idx + 1]

    assert mount_arg == "type=volume,source=mcpg_shared,target=/projects,readonly"
    assert "--confine-roots" in argv
    confine_idx = argv.index("--confine-roots")
    assert argv[confine_idx + 1] == "/projects"
    assert MOUNT == "/projects"


def test_argv_named_volume_mount_write(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_source", "volume:mcpg_shared")
    argv = _argv("run-rw-test", read_only=False)

    mount_idx = argv.index("--mount")
    mount_arg = argv[mount_idx + 1]

    assert mount_arg == "type=volume,source=mcpg_shared,target=/projects"
    assert ",readonly" not in mount_arg
    assert "--confine-roots" in argv
    confine_idx = argv.index("--confine-roots")
    assert argv[confine_idx + 1] == "/projects"


def test_argv_unset_fallback_to_bind_mount(monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_source", None)
    monkeypatch.setattr(settings, "upstream_fs_dir", tmp_path)

    # Read-only bind mount
    argv_ro = _argv("run-ro-bind", read_only=True)
    mount_idx_ro = argv_ro.index("--mount")
    mount_arg_ro = argv_ro[mount_idx_ro + 1]
    expected_ro = f"type=bind,source={tmp_path.resolve()},target=/projects,readonly"
    assert mount_arg_ro == expected_ro

    # Read-write bind mount
    argv_rw = _argv("run-rw-bind", read_only=False)
    mount_idx_rw = argv_rw.index("--mount")
    mount_arg_rw = argv_rw[mount_idx_rw + 1]
    expected_rw = f"type=bind,source={tmp_path.resolve()},target=/projects"
    assert mount_arg_rw == expected_rw
    assert ",readonly" not in mount_arg_rw

    # Target and confine-roots preserved
    assert argv_rw[argv_rw.index("--confine-roots") + 1] == "/projects"


def test_filesystem_path_validation_protections(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "upstream_fs_dir", tmp_path)

    # Allowed valid file
    valid_file = tmp_path / "valid.txt"
    valid_file.write_text("content")
    check_paths({"path": "/projects/valid.txt"})
    check_paths({"path": "valid.txt"})

    # Traversal leaving /projects
    with pytest.raises(ValueError, match="Path is outside the allowed directory"):
        check_paths({"path": "/projects/../outside.txt"})

    with pytest.raises(ValueError, match="Path is outside the allowed directory"):
        check_paths({"path": "../../outside.txt"})

    with pytest.raises(ValueError, match="Path is outside the allowed directory"):
        check_paths({"path": "/etc/passwd"})

    # Symlink disallowed
    symlink_file = tmp_path / "symlink.txt"
    symlink_file.symlink_to(valid_file)
    with pytest.raises(ValueError, match="Symlinks are not allowed"):
        check_paths({"path": "/projects/symlink.txt"})

    # Null byte disallowed
    with pytest.raises(ValueError, match="Path is not allowed"):
        check_paths({"path": "/projects/valid\x00.txt"})

    # Empty path disallowed
    with pytest.raises(ValueError, match="Path is not allowed"):
        check_paths({"path": ""})


def test_argv_generic_spec_no_mount():
    """Verify that a spec without a mount does not get a mount or filesystem args."""
    spec = UpstreamSpec(
        id="generic_nomount",
        prefix="gnm_",
        label="generic nomount",
        enabled=lambda: True,
        image=lambda: "nomount-server:1.0.0",
        timeout_s=lambda: 12.0,
        container_name_prefix="mcpg-gnm-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
        memory="128m",
        pids_limit=64,
    )

    argv = _argv(spec, "custom-container-name", read_only=True)

    # Hardened security flags preserved
    assert "--name" in argv
    assert argv[argv.index("--name") + 1] == "custom-container-name"
    assert "--network" in argv
    assert argv[argv.index("--network") + 1] == "none"
    assert "--read-only" in argv
    assert "--cap-drop" in argv
    assert argv[argv.index("--cap-drop") + 1] == "ALL"
    assert "--security-opt" in argv
    assert argv[argv.index("--security-opt") + 1] == "no-new-privileges"

    # Spec-driven resources
    assert "--memory" in argv
    assert argv[argv.index("--memory") + 1] == "128m"
    assert "--memory-swap" in argv
    assert argv[argv.index("--memory-swap") + 1] == "128m"
    assert "--pids-limit" in argv
    assert argv[argv.index("--pids-limit") + 1] == "64"

    # No mount flag and no filesystem command
    assert "--mount" not in argv
    assert "--confine-roots" not in argv
    assert argv[-1] == "nomount-server:1.0.0"


def test_argv_spec_driven_attributes_and_command_boundary():
    """Verify spec-driven container name prefix and command boundaries."""
    spec = UpstreamSpec(
        id="custom_lab",
        prefix="lab_",
        label="custom lab",
        enabled=lambda: True,
        image=lambda: "lab-image:v1",
        timeout_s=lambda: 30.0,
        container_name_prefix="mcpg-customlab-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
        mount=lambda ro: (
            "type=bind,source=/tmp/lab,target=/lab,readonly"
            if ro
            else "type=bind,source=/tmp/lab,target=/lab"
        ),
        memory="512m",
        pids_limit=256,
    )

    # Call _argv without passing container name
    argv_ro = _argv(spec, read_only=True)
    container_name_ro = argv_ro[argv_ro.index("--name") + 1]
    assert container_name_ro.startswith("mcpg-customlab-")
    assert "--mount" in argv_ro
    assert (
        argv_ro[argv_ro.index("--mount") + 1]
        == "type=bind,source=/tmp/lab,target=/lab,readonly"
    )
    assert "--memory" in argv_ro
    assert argv_ro[argv_ro.index("--memory") + 1] == "512m"
    assert "--pids-limit" in argv_ro
    assert argv_ro[argv_ro.index("--pids-limit") + 1] == "256"
    assert argv_ro[-1] == "lab-image:v1"
    assert "--confine-roots" not in argv_ro

    # Read-write call
    argv_rw = _argv(spec, read_only=False)
    assert (
        argv_rw[argv_rw.index("--mount") + 1] == "type=bind,source=/tmp/lab,target=/lab"
    )
    assert ",readonly" not in argv_rw[argv_rw.index("--mount") + 1]


def test_argv_filesystem_spec_appends_confine_roots():
    """Verify that FILESYSTEM spec appends --confine-roots /projects after image."""
    argv = _argv(FILESYSTEM, "fs-test-container", read_only=True)
    assert "--confine-roots" in argv
    confine_idx = argv.index("--confine-roots")
    assert argv[confine_idx + 1] == "/projects"
    # Image must be directly before --confine-roots
    assert argv[confine_idx - 1] == FILESYSTEM.image()


def test_get_upstream_executor_and_filesystem_alias():
    """Verify executor retrieval, caching, and backward-compatible filesystem aliases."""
    exec1 = get_upstream_executor(FILESYSTEM)
    exec2 = get_upstream_executor(FILESYSTEM)
    assert exec1 is exec2
    assert isinstance(exec1, UpstreamExecutor)

    fs_exec = get_filesystem_executor()
    assert fs_exec is exec1

    assert FilesystemExecutor is UpstreamExecutor
    assert FilesystemSession is UpstreamSession


async def test_discover_tools_generic_and_filesystem_alias():
    """Verify generic discover_tools and discover_filesystem_tools alias."""
    mock_tools = [{"name": "test_tool", "description": "desc", "inputSchema": {}}]
    spec = UpstreamSpec(
        id="disc_spec",
        prefix="disc_",
        label="discover spec",
        enabled=lambda: True,
        image=lambda: "disc:latest",
        timeout_s=lambda: 5.0,
        container_name_prefix="mcpg-disc-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )

    with (
        patch.object(
            UpstreamSession, "list_tools", new=AsyncMock(return_value=mock_tools)
        ),
        patch.object(UpstreamSession, "close", new=AsyncMock()) as mock_close,
    ):
        result = await discover_tools(spec)
        assert result == mock_tools
        assert mock_close.called

    with (
        patch.object(
            UpstreamSession, "list_tools", new=AsyncMock(return_value=mock_tools)
        ),
        patch.object(UpstreamSession, "close", new=AsyncMock()) as mock_close,
    ):
        fs_result = await discover_filesystem_tools()
        assert fs_result == mock_tools
        assert mock_close.called


async def test_upstream_executor_execute_success():
    """Verify tool execution via UpstreamExecutor with argument validation and contract check."""
    validated_args: list[dict] = []

    def custom_check_args(args: dict) -> None:
        validated_args.append(args)

    spec = UpstreamSpec(
        id="test_exec",
        prefix="tst_",
        label="test exec",
        enabled=lambda: True,
        image=lambda: "test:latest",
        timeout_s=lambda: 10.0,
        container_name_prefix="mcpg-tst-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
        check_args=custom_check_args,
    )
    register_spec(spec)

    tool_def = {
        "name": "echo",
        "description": "Echoes input",
        "inputSchema": {"type": "object"},
    }
    fp = contract_fingerprint("tst_echo", "Echoes input", {"type": "object"})
    from app.upstream.registry import _tools

    _tools["tst_echo"] = RegisteredTool(
        spec_id="test_exec",
        upstream_name="echo",
        public_name="tst_echo",
        read_only=True,
        fingerprint=fp,
    )

    executor = get_upstream_executor(spec)
    context = _dummy_context()

    with (
        patch("app.upstream.runner.current_run_id", return_value="test-run-123"),
        patch.object(
            UpstreamSession, "list_tools", new=AsyncMock(return_value=[tool_def])
        ),
        patch.object(
            UpstreamSession,
            "call_tool",
            new=AsyncMock(
                return_value={
                    "isError": False,
                    "content": [{"type": "text", "text": "executed_output"}],
                }
            ),
        ),
        patch.object(UpstreamSession, "close", new=AsyncMock()) as mock_close,
    ):
        result = await executor.execute("tst_echo", {"key": "val"}, context)
        assert result == "executed_output"
        assert len(validated_args) == 1
        assert validated_args[0] == {"key": "val"}
        assert mock_close.called


async def test_upstream_executor_contract_changed_drift():
    """Verify tool pin drift detection during execution."""
    spec = UpstreamSpec(
        id="test_drift",
        prefix="drf_",
        label="test drift",
        enabled=lambda: True,
        image=lambda: "test:latest",
        timeout_s=lambda: 10.0,
        container_name_prefix="mcpg-drf-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )
    register_spec(spec)

    fp = contract_fingerprint("drf_tool", "Original desc", {"type": "object"})
    from app.upstream.registry import _tools

    _tools["drf_tool"] = RegisteredTool(
        spec_id="test_drift",
        upstream_name="tool",
        public_name="drf_tool",
        read_only=True,
        fingerprint=fp,
    )

    executor = get_upstream_executor(spec)
    context = _dummy_context()

    # Upstream container reports modified description
    drifted_tool = {
        "name": "tool",
        "description": "Drifted desc",
        "inputSchema": {"type": "object"},
    }

    with (
        patch("app.upstream.runner.current_run_id", return_value="test-run-123"),
        patch.object(
            UpstreamSession, "list_tools", new=AsyncMock(return_value=[drifted_tool])
        ),
        patch.object(UpstreamSession, "close", new=AsyncMock()),
        pytest.raises(SandboxUpstreamError, match=CONTRACT_CHANGED),
    ):
        await executor.execute("drf_tool", {}, context)


async def test_upstream_executor_upstream_error_result():
    """Verify handling of isError=True upstream responses."""
    spec = UpstreamSpec(
        id="test_err",
        prefix="err_",
        label="test err",
        enabled=lambda: True,
        image=lambda: "test:latest",
        timeout_s=lambda: 10.0,
        container_name_prefix="mcpg-err-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )
    register_spec(spec)

    fp = contract_fingerprint("err_tool", "desc", {"type": "object"})
    from app.upstream.registry import _tools

    _tools["err_tool"] = RegisteredTool(
        spec_id="test_err",
        upstream_name="tool",
        public_name="err_tool",
        read_only=True,
        fingerprint=fp,
    )

    executor = get_upstream_executor(spec)
    context = _dummy_context()

    with (
        patch("app.upstream.runner.current_run_id", return_value="test-run-123"),
        patch.object(
            UpstreamSession,
            "list_tools",
            new=AsyncMock(
                return_value=[
                    {
                        "name": "tool",
                        "description": "desc",
                        "inputSchema": {"type": "object"},
                    }
                ]
            ),
        ),
        patch.object(
            UpstreamSession,
            "call_tool",
            new=AsyncMock(
                return_value={
                    "isError": True,
                    "content": [{"type": "text", "text": "internal failure"}],
                }
            ),
        ),
        patch.object(UpstreamSession, "close", new=AsyncMock()),
        pytest.raises(
            SandboxUpstreamError, match=f"^{UPSTREAM_ERROR_PREFIX}internal failure"
        ),
    ):
        await executor.execute("err_tool", {}, context)


async def test_upstream_session_timeout_and_cleanup():
    """Verify session timeout triggers cleanup and raises SandboxTimeoutError."""
    spec = UpstreamSpec(
        id="test_to",
        prefix="to_",
        label="test to",
        enabled=lambda: True,
        image=lambda: "test:latest",
        timeout_s=lambda: 0.05,
        container_name_prefix="mcpg-to-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )
    session = UpstreamSession(spec)
    session._client = AsyncMock()
    session._client.request = AsyncMock(side_effect=TimeoutError())

    with patch.object(session, "_stop", new=AsyncMock()) as mock_stop:
        with pytest.raises(SandboxTimeoutError):
            await session._request("tools/call", {})
        assert mock_stop.called


def test_raise_startup_error_categorization():
    """Verify subprocess exit code and stderr error categorization."""
    # Docker daemon errors
    with pytest.raises(SandboxUnavailableError) as exc:
        _raise_startup(
            125,
            b"Error: cannot connect to the Docker daemon at unix:///var/run/docker.sock",
        )
    assert exc.value.error_type == ERROR_DOCKER_UNAVAILABLE

    # Missing image errors
    with pytest.raises(SandboxUnavailableError) as exc:
        _raise_startup(1, b"Error: Unable to find image 'missing:latest' locally")
    assert exc.value.error_type == ERROR_IMAGE_MISSING

    # Upstream process failure during startup
    with pytest.raises(SandboxUpstreamError) as exc:
        _raise_startup(1, b"unexpected error")
    assert exc.value.error_type == ERROR_UPSTREAM


def test_content_text_output_size_cap(monkeypatch):
    """Verify output size cap raises SandboxOutputError."""
    from app.config import settings

    monkeypatch.setattr(settings, "sandbox_max_output_bytes", 50)
    with pytest.raises(SandboxOutputError):
        _content_text([{"type": "text", "text": "x" * 100}])


async def test_upstream_error_recorded_by_executor():
    """Verify SandboxUpstreamError is recorded with error_type=ERROR_UPSTREAM."""
    import time
    from unittest.mock import AsyncMock, MagicMock

    from app.sandbox.executor import _execute_bound

    finish_mock = AsyncMock()
    mock_exec = MagicMock()
    mock_exec.execute = AsyncMock(side_effect=SandboxUpstreamError("custom failure"))

    with pytest.raises(SandboxUpstreamError):
        await _execute_bound(
            mock_exec,
            "test_tool",
            {},
            MagicMock(),
            "run-123",
            time.monotonic() + 10,
            finish_mock,
            None,
        )

    finish_mock.assert_awaited_once_with(
        "failed",
        exit_code=None,
        output_bytes=0,
        error_type=ERROR_UPSTREAM,
    )

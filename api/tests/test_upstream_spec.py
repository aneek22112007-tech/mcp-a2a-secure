from dataclasses import FrozenInstanceError
from typing import Any

import pytest

from app.auth.scopes import FILES_READ, FILES_WRITE
from app.config import settings
from app.main import app  # noqa: F401
from app.upstream.filesystem import (
    READ_ONLY_TOOLS,
    UPSTREAM_ERROR_PREFIX,
    WRITE_TOOLS,
    check_paths,
)
from app.upstream.spec import UpstreamSpec


def _dummy_spec(**overrides: Any) -> UpstreamSpec:
    defaults: dict[str, Any] = {
        "id": "test_upstream",
        "prefix": "test_",
        "label": "test upstream",
        "enabled": lambda: True,
        "image": lambda: "test-image:1.0",
        "timeout_s": lambda: 15.0,
        "container_name_prefix": "mcpg-test-",
        "scope_for": lambda name: "test:scope" if name == "scoped_tool" else None,
        "read_only_for": lambda name: name != "write_tool",
        "mount": lambda ro: (
            f"type=bind,source=/test,target=/data{',readonly' if ro else ''}"
        ),
        "check_args": lambda args: None,
        "memory": "256m",
        "pids_limit": 128,
    }
    defaults.update(overrides)
    return UpstreamSpec(**defaults)


def test_upstream_spec_attributes():
    spec = _dummy_spec()
    assert spec.id == "test_upstream"
    assert spec.prefix == "test_"
    assert spec.label == "test upstream"
    assert spec.enabled() is True
    assert spec.image() == "test-image:1.0"
    assert spec.timeout_s() == 15.0
    assert spec.container_name_prefix == "mcpg-test-"
    assert spec.scope_for("scoped_tool") == "test:scope"
    assert spec.scope_for("unscoped_tool") is None
    assert spec.read_only_for("read_tool") is True
    assert spec.read_only_for("write_tool") is False
    assert spec.mount(True) == "type=bind,source=/test,target=/data,readonly"
    assert spec.mount(False) == "type=bind,source=/test,target=/data"
    assert spec.memory == "256m"
    assert spec.pids_limit == 128


def test_upstream_spec_immutability():
    spec = _dummy_spec()
    with pytest.raises(FrozenInstanceError):
        spec.id = "modified"  # type: ignore[misc]

    with pytest.raises(FrozenInstanceError):
        spec.memory = "512m"  # type: ignore[misc]

    with pytest.raises(FrozenInstanceError):
        spec.pids_limit = 64  # type: ignore[misc]


def test_upstream_spec_defaults():
    spec = UpstreamSpec(
        id="minimal",
        prefix="min_",
        label="minimal",
        enabled=lambda: False,
        image=lambda: "min-image:latest",
        timeout_s=lambda: 5.0,
        container_name_prefix="mcpg-min-",
        scope_for=lambda _: None,
        read_only_for=lambda _: True,
    )
    assert spec.mount(True) is None
    assert spec.mount(False) is None
    assert spec.check_args({"any": "args"}) is None
    assert spec.memory == "256m"
    assert spec.pids_limit == 128


def test_upstream_spec_validation():
    with pytest.raises(ValueError, match="Upstream id must not be empty"):
        _dummy_spec(id="")

    with pytest.raises(ValueError, match="Upstream id must not be empty"):
        _dummy_spec(id="   ")

    with pytest.raises(ValueError, match="Upstream prefix must not be empty"):
        _dummy_spec(prefix="")

    with pytest.raises(ValueError, match="Upstream label must not be empty"):
        _dummy_spec(label="")

    with pytest.raises(
        ValueError, match="Upstream container_name_prefix must not be empty"
    ):
        _dummy_spec(container_name_prefix="")

    with pytest.raises(ValueError, match="Upstream memory must not be empty"):
        _dummy_spec(memory="")

    with pytest.raises(ValueError, match="Upstream pids_limit must be greater than 0"):
        _dummy_spec(pids_limit=0)

    with pytest.raises(ValueError, match="Upstream pids_limit must be greater than 0"):
        _dummy_spec(pids_limit=-1)


def test_upstream_spec_filesystem_compatibility(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upstream_fs_dir", tmp_path)

    def fs_scope(name: str) -> str | None:
        if name in READ_ONLY_TOOLS:
            return FILES_READ
        if name in WRITE_TOOLS:
            return FILES_WRITE
        return None

    def fs_mount(read_only: bool) -> str:
        base = f"type=bind,source={tmp_path.resolve()},target=/projects"
        return f"{base},readonly" if read_only else base

    fs_spec = UpstreamSpec(
        id="filesystem",
        prefix="fs_",
        label="filesystem",
        enabled=lambda: settings.upstream_fs_enabled,
        image=lambda: settings.upstream_fs_image,
        timeout_s=lambda: settings.upstream_fs_timeout_s,
        container_name_prefix="mcpg-fs-",
        scope_for=fs_scope,
        read_only_for=lambda name: name not in WRITE_TOOLS,
        mount=fs_mount,
        check_args=check_paths,
        memory="256m",
        pids_limit=128,
    )

    assert fs_spec.id == "filesystem"
    assert fs_spec.prefix == "fs_"
    assert fs_spec.label == "filesystem"
    assert fs_spec.container_name_prefix == "mcpg-fs-"
    assert fs_spec.enabled() == settings.upstream_fs_enabled
    assert fs_spec.image() == settings.upstream_fs_image
    assert fs_spec.timeout_s() == settings.upstream_fs_timeout_s

    # Security check: scope mapping
    assert fs_spec.scope_for("read_text_file") == FILES_READ
    assert fs_spec.scope_for("list_directory") == FILES_READ
    assert fs_spec.scope_for("write_file") == FILES_WRITE
    assert fs_spec.scope_for("edit_file") == FILES_WRITE
    assert fs_spec.scope_for("unmapped_tool") is None

    # Security check: read-only decisions
    assert fs_spec.read_only_for("read_text_file") is True
    assert fs_spec.read_only_for("list_directory") is True
    assert fs_spec.read_only_for("write_file") is False
    assert fs_spec.read_only_for("edit_file") is False
    assert fs_spec.read_only_for("unmapped_tool") is True

    # Mount checks
    assert fs_spec.mount(True).endswith(",readonly")
    assert not fs_spec.mount(False).endswith(",readonly")

    # Argument validation check
    valid_file = tmp_path / "valid.txt"
    valid_file.write_text("hello")
    fs_spec.check_args({"path": "valid.txt"})

    with pytest.raises(ValueError, match=f"^{UPSTREAM_ERROR_PREFIX}"):
        fs_spec.check_args({"path": "/projects/../outside.txt"})

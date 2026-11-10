import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import app  # noqa: F401
from app.upstream.filesystem import MOUNT, check_paths
from app.upstream.runner import _argv


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

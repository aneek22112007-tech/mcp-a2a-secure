from app.config import Settings


def _isolated_settings(monkeypatch, **overrides) -> Settings:
    for key in (
        "APP_NAME",
        "ENVIRONMENT",
        "APP_ENV",
        "DATABASE_URL",
        "NOTES_DIR",
        "MAX_BODY_BYTES",
        "TOOL_TIMEOUT_S",
        "SANDBOX_MODE",
        "SANDBOX_IMAGE",
        "SANDBOX_TIMEOUT_S",
        "SANDBOX_MEMORY",
        "SANDBOX_CPUS",
        "SANDBOX_PIDS_LIMIT",
        "SANDBOX_MAX_FILE_BYTES",
        "SANDBOX_MAX_OUTPUT_BYTES",
        "SANDBOX_MAX_CONCURRENT",
        "SANDBOX_NETWORK",
        "SANDBOX_RUN_AS",
        "SANDBOX_NOTES_SOURCE",
        "SANDBOX_DOCKER_BIN",
        "CORS_ORIGINS",
        "MCP_SELF_URL",
        "TOOL_PINNING_MODE",
        "TOOL_PINNING_BOOTSTRAP_APPROVE",
        "TOOL_PINNING_CACHE_TTL_S",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in overrides.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_default_config_values(monkeypatch):
    settings = _isolated_settings(monkeypatch)
    assert settings.app_name == "MCP Guard"
    assert settings.environment == "dev"
    assert "http://localhost:5173" in settings.cors_origins
    assert settings.mcp_self_url == "http://127.0.0.1:8000/mcp/"
    assert settings.notes_dir.name == "notes"
    assert settings.notes_dir.parent.name == "data"
    assert settings.max_body_bytes == 1_048_576
    assert settings.tool_timeout_s == 5


def test_config_extra_ignore(monkeypatch):
    settings = _isolated_settings(monkeypatch)
    built = settings.model_copy(update={})
    assert not hasattr(built, "unknown_field")
    ignored = Settings(_env_file=None, unknown_field="value")
    assert not hasattr(ignored, "unknown_field")


def test_config_env_overrides(monkeypatch, tmp_path):
    notes = tmp_path / "notes"
    settings = _isolated_settings(
        monkeypatch,
        APP_NAME="Test App",
        ENVIRONMENT="test",
        NOTES_DIR=str(notes),
        MAX_BODY_BYTES="2048",
        TOOL_TIMEOUT_S="2.5",
    )
    assert settings.app_name == "Test App"
    assert settings.environment == "test"
    assert settings.notes_dir == notes.resolve()
    assert not notes.exists()
    assert settings.max_body_bytes == 2048
    assert settings.tool_timeout_s == 2.5


def test_settings_do_not_create_directories(monkeypatch, tmp_path):
    notes = tmp_path / "missing-notes"
    database = tmp_path / "nested" / "guard.db"
    settings = _isolated_settings(
        monkeypatch,
        NOTES_DIR=str(notes),
        DATABASE_URL=f"sqlite+aiosqlite:///{database}",
    )
    assert settings.notes_dir == notes.resolve()
    assert not notes.exists()
    assert not database.exists()
    assert not database.parent.exists()

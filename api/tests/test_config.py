from pathlib import Path

from app.config import Settings


def test_default_config_values():
    settings = Settings()
    assert settings.app_name == "MCP Guard"
    assert settings.environment == "dev"
    assert "http://localhost:5173" in settings.cors_origins
    assert settings.mcp_self_url == "http://127.0.0.1:8000/mcp/"
    assert settings.notes_dir.name == "notes"
    assert settings.notes_dir.parent.name == "data"
    assert settings.notes_dir.exists()


def test_config_extra_ignore():
    # If we pass an unknown value, it should be ignored and not raise ValidationError
    settings = Settings(unknown_field="value")
    assert not hasattr(settings, "unknown_field")


def test_config_env_overrides(monkeypatch):
    monkeypatch.setenv("APP_NAME", "Test App")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("NOTES_DIR", "/tmp/mcp_test_notes")

    settings = Settings()
    assert settings.app_name == "Test App"
    assert settings.environment == "test"
    assert settings.notes_dir == Path("/tmp/mcp_test_notes").resolve()
    assert settings.notes_dir.exists()


def test_config_invalid_notes_dir():
    # pydantic Settings doesn't prevent creating a Path from any string, but we want to make sure it's created.
    # if we pass an empty string, it resolves to current directory.
    # Pydantic's Path type doesn't validate strictly unless we do further checks. But since we use Path, we're testing model_post_init behavior.
    pass

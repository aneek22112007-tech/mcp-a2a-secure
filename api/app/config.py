from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Package root is api/, regardless of the process working directory.
_API_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_NOTES_DIR = _API_ROOT / "data" / "notes"

_DEFAULT_DB_PATH = _API_ROOT / "data" / "mcp_guard.db"
_DEFAULT_DB_URL = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"


class Settings(BaseSettings):
    """Process configuration.

    Constructing settings must not create directories.
    Note storage creates its own directory when it is first used.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MCP Guard"
    environment: str = Field(
        default="dev",
        validation_alias=AliasChoices("ENVIRONMENT", "APP_ENV"),
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    mcp_self_url: str = "http://127.0.0.1:8000/mcp/"
    mcp_self_api_key: SecretStr | None = Field(
        default=None,
        description="API key for internal status probe",
    )

    database_url: str = Field(
        default=_DEFAULT_DB_URL,
        description="Async database connection URL",
    )

    notes_dir: Path = Field(
        default=_DEFAULT_NOTES_DIR,
        description="Directory to store notes",
    )

    max_body_bytes: int = Field(default=1_048_576, gt=0)
    tool_timeout_s: float = Field(default=5.0, gt=0)

    api_key_pepper: SecretStr | None = Field(
        default=None,
        description="Pepper used to hash API keys.",
    )
    audit_stream_max_subscribers: int = Field(
        default=20,
        gt=0,
        description="Maximum concurrent GET /api/audit/stream subscribers.",
    )
    audit_stream_queue_size: int = Field(
        default=100,
        gt=0,
        description="Per-subscriber audit stream queue size. Full queues drop events.",
    )

    def model_post_init(self, context: object, /) -> None:
        del context
        self.notes_dir = Path(self.notes_dir).expanduser().resolve()

        is_prod = self.environment not in ("dev", "development", "local", "test")
        if is_prod and not self.api_key_pepper:
            raise ValueError("API_KEY_PEPPER is required in production environment")


settings = Settings()

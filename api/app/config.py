from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Package root is api/, regardless of the process working directory.
_API_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = (_API_ROOT / "data" / "mcp_guard.db").resolve()
_DEFAULT_DATABASE_URL = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"
_DEFAULT_NOTES_DIR = _API_ROOT / "data" / "notes"


class Settings(BaseSettings):
    """Process configuration.

    Constructing settings must not create directories or touch the database.
    Resource directories are created by database startup and note storage.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "MCP Guard"
    environment: str = Field(
        default="dev",
        validation_alias=AliasChoices("ENVIRONMENT", "APP_ENV"),
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    mcp_self_url: str = "http://127.0.0.1:8000/mcp/"

    database_url: str = Field(
        default=_DEFAULT_DATABASE_URL,
        description="Async database connection URL",
    )

    notes_dir: Path = Field(
        default=_DEFAULT_NOTES_DIR,
        description="Directory to store notes",
    )

    max_body_bytes: int = Field(default=1_048_576, gt=0)
    tool_timeout_s: float = Field(default=5.0, gt=0)

    def model_post_init(self, context: object, /) -> None:
        del context
        self.notes_dir = Path(self.notes_dir).expanduser().resolve()


settings = Settings()

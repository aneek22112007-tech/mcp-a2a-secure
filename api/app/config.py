from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "MCP Guard"
    environment: str = "dev"
    cors_origins: list[str] = ["http://localhost:5173"]
    mcp_self_url: str = "http://127.0.0.1:8000/mcp/"

    database_url: str = Field(
        default="sqlite+aiosqlite:///data/mcp_guard.db",
        description="Async database connection URL",
    )

    notes_dir: Path = Field(
        default=Path(__file__).parent.parent / "data" / "notes",
        description="Directory to store notes",
    )

    def model_post_init(self, __context, /) -> None:
        self.notes_dir = self.notes_dir.resolve()
        self.notes_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()

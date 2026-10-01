from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    app_name: str = "MCP Guard"
    environment: str = "dev"
    cors_origins: list[str] = ["http://localhost:5173"]
    mcp_self_url: str = "http://127.0.0.1:8000/mcp/"


settings = Settings()

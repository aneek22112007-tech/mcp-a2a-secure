from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    app_name: str = "Polaris"
    environment: str = "dev"
    cors_origins: list[str] = ["http://localhost:5173"]

settings = Settings()

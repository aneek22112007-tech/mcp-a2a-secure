import ipaddress
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator
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
    trusted_proxies: list[str] = Field(default_factory=list)
    auth_failure_limit: int = Field(20, gt=0)
    auth_failure_window_s: int = Field(60, gt=0)
    auth_failure_max_tracked_ips: int = Field(10_000, gt=0)
    hsts_max_age_s: int = Field(
        default=0, ge=0, description="Max-Age for Strict-Transport-Security header"
    )
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
    rate_limit_capacity: int = Field(
        default=100,
        gt=0,
        description="Maximum tokens available in the token bucket rate limiter.",
    )
    rate_limit_refill_rate_per_sec: float = Field(
        default=10.0,
        gt=0,
        description="Tokens refilled per second in the token bucket rate limiter.",
    )
    audit_retention_days: int = Field(
        default=90,
        gt=0,
        description="Number of days to retain audit log events.",
    )
    enable_retention_scheduler: bool = Field(
        default=False,
        description="Enable automatic cleanup of old audit records via a background task.",
    )

    @field_validator("environment", mode="before")
    @classmethod
    def strip_and_lower_environment(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @property
    def is_development(self) -> bool:
        return self.environment in {"dev", "development", "local"}

    @property
    def is_production_like(self) -> bool:
        return self.environment not in {"dev", "development", "local", "test"}

    def model_post_init(self, context: object, /) -> None:
        del context
        self.notes_dir = Path(self.notes_dir).expanduser().resolve()

        if self.is_production_like and not self.api_key_pepper:
            raise ValueError("API_KEY_PEPPER is required in production environment")

        if self.is_production_like:
            for origin in self.cors_origins:
                if not _is_exact_http_origin(origin):
                    raise ValueError(
                        "CORS_ORIGINS must be exact http/https origins in production"
                    )

        networks = []
        for p in self.trusted_proxies:
            networks.append(ipaddress.ip_network(p, strict=False))
        self.__dict__["_parsed_trusted_proxies"] = tuple(networks)

    @property
    def parsed_trusted_proxies(self) -> tuple:
        return self.__dict__.get("_parsed_trusted_proxies", ())


def _is_exact_http_origin(origin: str) -> bool:
    """True for scheme://host[:port] with nothing else attached."""

    if not isinstance(origin, str) or "*" in origin:
        return False
    try:
        parts = urlsplit(origin)
        # Accessing port validates it. A non-numeric or out-of-range port raises.
        _port = parts.port
    except ValueError:
        return False
    del _port
    if parts.scheme not in {"http", "https"}:
        return False
    if not parts.hostname:
        return False
    if parts.username is not None or parts.password is not None:
        return False
    if parts.path or parts.query or parts.fragment:
        return False
    return origin == f"{parts.scheme}://{parts.netloc}"


settings = Settings()

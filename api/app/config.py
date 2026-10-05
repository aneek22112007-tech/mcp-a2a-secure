import ipaddress
import re
from pathlib import Path
from typing import Any, Literal
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
    sandbox_mode: Literal["docker", "inprocess"] = "docker"
    sandbox_image: str = Field(default="mcp-guard-tool-runner:local", min_length=1)
    sandbox_timeout_s: float = Field(default=4.0, gt=0)
    sandbox_memory: str = Field(default="128m", pattern=r"^[1-9]\d*([kKmMgG])?$")
    sandbox_cpus: float = Field(default=0.5, gt=0)
    sandbox_pids_limit: int = Field(default=64, gt=0)
    sandbox_max_file_bytes: int = Field(default=1_048_576, gt=0)
    sandbox_max_output_bytes: int = Field(default=1_048_576, gt=0)
    sandbox_max_concurrent: int = Field(default=4, gt=0)
    sandbox_network: str = Field(
        default="none",
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$",
    )
    sandbox_run_as: str = "65534:65534"
    sandbox_notes_source: str | None = None
    sandbox_docker_bin: str = Field(default="docker", min_length=1, pattern=r"^[^\s]+$")

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
    sandbox_run_retention_days: int = Field(
        default=90,
        gt=0,
        description="Number of days to retain sandbox runs.",
    )
    tool_pinning_mode: Literal["off", "warn", "enforce"] = Field(
        default="off",
        description=(
            "off skips pinning, warn audits and continues, "
            "enforce denies unapproved tools."
        ),
    )
    tool_pinning_bootstrap_approve: bool = Field(
        default=False,
        description=(
            "Approve every current tool at startup. "
            "Rejected when the environment is production-like."
        ),
    )
    tool_pinning_cache_ttl_s: float = Field(
        default=5.0,
        ge=0,
        description=(
            "Seconds to cache tool pin rows. Approve and revoke clear the cache."
        ),
    )
    scanner_enabled: bool = Field(
        default=True,
        description="Enable the rule-based tool-poisoning scanner.",
    )
    scanner_block_severities: str = Field(
        default="high,critical",
        description="Comma-separated list of severities that block execution.",
    )
    scanner_run_on_startup: bool = Field(
        default=True,
        description="Run scanner on all tools during startup.",
    )

    @field_validator("environment", mode="before")
    @classmethod
    def strip_and_lower_environment(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("sandbox_notes_source", mode="before")
    @classmethod
    def blank_notes_source(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() == "":
            return None
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

        if self.is_production_like and self.tool_pinning_bootstrap_approve:
            raise ValueError(
                "TOOL_PINNING_BOOTSTRAP_APPROVE is not allowed in production"
            )

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
        self._validate_sandbox()

    def _validate_sandbox(self) -> None:
        if self.sandbox_network.casefold() == "host":
            raise ValueError("SANDBOX_NETWORK=host is not allowed")
        if not re.fullmatch(r"\d+:\d+", self.sandbox_run_as):
            raise ValueError("SANDBOX_RUN_AS must be uid:gid")
        source = self.sandbox_notes_source
        if source is not None and not (
            Path(source).is_absolute()
            or re.fullmatch(r"volume:[A-Za-z0-9_.-]+", source)
        ):
            raise ValueError(
                "SANDBOX_NOTES_SOURCE must be an absolute path or volume:<name>"
            )
        _reject_unsafe_bind_source(source, self.notes_dir)
        if self.tool_timeout_s <= self.sandbox_timeout_s:
            # A shortened gateway timeout with the default sandbox budget still
            # has to load. An explicit sandbox timeout that does not fit is rejected.
            if "sandbox_timeout_s" in self.model_fields_set:
                raise ValueError(
                    "TOOL_TIMEOUT_S must be greater than SANDBOX_TIMEOUT_S"
                )
            self.sandbox_timeout_s = self.tool_timeout_s / 2
        if not self.is_production_like:
            return
        if self.sandbox_mode == "inprocess":
            raise ValueError("SANDBOX_MODE=inprocess is not allowed in production")
        if self.sandbox_network != "none":
            raise ValueError("SANDBOX_NETWORK must be none in production")
        uid_text, gid_text = self.sandbox_run_as.split(":", 1)
        if int(uid_text) <= 0 or int(gid_text) <= 0:
            raise ValueError(
                "SANDBOX_RUN_AS uid and gid must be greater than 0 in production"
            )

    @property
    def parsed_trusted_proxies(self) -> tuple:
        return self.__dict__.get("_parsed_trusted_proxies", ())


def _path_breaks_mount(path: str) -> bool:
    """True when a path would inject extra ``docker --mount`` options."""

    return any(char in path for char in (",", "=", "\n", "\r"))


def _reject_unsafe_bind_source(source: str | None, notes_dir: Path) -> None:
    """Reject bind paths that contain mount-option separators.

    A named volume is not a bind source. ``NOTES_DIR`` is checked only when
    the sandbox mounts it.
    """

    if source is not None and re.fullmatch(r"volume:[A-Za-z0-9_.-]+", source):
        return
    if source is not None:
        texts = (source, str(Path(source).expanduser().resolve()))
        label = "SANDBOX_NOTES_SOURCE"
    else:
        texts = (str(notes_dir),)
        label = "NOTES_DIR"
    if any(_path_breaks_mount(text) for text in texts):
        raise ValueError(f"{label} path must not contain commas or equals signs")


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

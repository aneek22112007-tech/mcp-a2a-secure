import ipaddress
import re
import socket
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
_PLACEHOLDER_PEPPERS = frozenset(
    {
        "replace-with-a-local-development-secret",
        "change-me-to-a-long-random-value",
        "changeme",
        "change-me",
        "secret",
        "pepper",
        "password",
        "to-be-changed",
    }
)


def _pepper_is_placeholder(value: SecretStr) -> bool:
    """True when a production pepper is empty or a known stand-in."""
    text = value.get_secret_value().strip().lower()
    return (
        text == ""
        or text in _PLACEHOLDER_PEPPERS
        or text.startswith(("change-me", "replace-with"))
    )


def normalize_database_url(url: str) -> str:
    """Normalize a database URL for async SQLAlchemy.

    PostgreSQL connection strings starting with ``postgres://`` or
    ``postgresql://`` (without driver specification) are mapped to
    ``postgresql+asyncpg://``. Already-specified driver schemes (such as
    ``postgresql+asyncpg://``) and SQLite URLs are preserved unchanged.
    """
    if not isinstance(url, str):
        return url
    stripped = url.strip()
    if stripped.startswith("postgres://"):
        return f"postgresql+asyncpg://{stripped[len('postgres://') :]}"
    if stripped.startswith("postgresql://"):
        return f"postgresql+asyncpg://{stripped[len('postgresql://') :]}"
    return stripped


class Settings(BaseSettings):
    """Process configuration.

    Constructing settings must not create directories.
    Note storage creates its own directory when it is first used.
    """

    # Startup errors must never echo env values such as API_KEY_PEPPER.
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", hide_input_in_errors=True
    )

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
    upstream_fs_enabled: bool = Field(
        default=False,
        description="Register the official filesystem MCP server as fs_ tools.",
    )
    upstream_fs_image: str = Field(
        default="mcp-guard-upstream-fs:2.2.0",
        min_length=1,
        pattern=r"^[^\s]+$",
        description="Image tag started once per fs_ call.",
    )
    upstream_fs_source: str | None = Field(
        default=None,
        description="Docker named volume for filesystem upstream (volume:<name>).",
    )
    upstream_fs_dir: Path = Field(
        default=_API_ROOT / "data" / "shared",
        description="Host directory mounted at /projects. Not created by Settings.",
    )
    upstream_fs_timeout_s: float = Field(
        default=30.0,
        gt=0,
        description=(
            "Seconds for one filesystem container, including image startup. "
            "Independent of SANDBOX_TIMEOUT_S."
        ),
    )
    upstream_lab_enabled: bool = Field(
        default=False,
        description="Register the hostile lab MCP server as lab_ tools. Development only.",
    )
    upstream_lab_image: str = Field(
        default="mcp-guard-upstream-lab:current",
        min_length=1,
        pattern=r"^[^\s]+$",
        description="Image tag started once per lab_ call.",
    )
    upstream_lab_timeout_s: float = Field(
        default=10.0,
        gt=0,
        description="Seconds for one lab container execution.",
    )

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
        default=30,
        gt=0,
        description="Maximum tokens available in the token bucket rate limiter.",
    )
    rate_limit_refill_rate_per_sec: float = Field(
        default=5.0,
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
    demo_poison_tool: bool = Field(
        default=False,
        validation_alias=AliasChoices("MCPG_DEMO_POISON_TOOL"),
        description=(
            "Register a harmless poisoned test tool so the scanner demo "
            "has findings. Development only."
        ),
    )
    llm_enabled: bool = Field(
        default=False,
        description="Enable LLM calls. When false, the notes agent returns 503.",
    )
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Base URL of the local Ollama server.",
    )
    ollama_model: str = Field(
        default="qwen3.5:9b",
        min_length=1,
        description="Ollama model used as the primary chat model.",
    )
    groq_api_key: SecretStr | None = Field(
        default=None,
        description="Groq API key. Used only when Ollama cannot be reached.",
    )
    groq_model: str = Field(
        default="llama-3.3-70b-versatile",
        min_length=1,
        description="Groq model used as the fallback chat model.",
    )
    llm_timeout_seconds: float = Field(
        default=60,
        gt=0,
        description="Timeout for one LLM request, in seconds.",
    )
    notes_agent_api_key: SecretStr | None = Field(
        default=None,
        description="MCP Guard API key the notes agent sends to /mcp/.",
    )
    injection_guard_mode: Literal["off", "warn", "enforce"] = Field(
        default="warn",
        validation_alias=AliasChoices("INJECTION_GUARD_MODE", "injection_guard_mode"),
        description=(
            "off skips injection guard, warn audits and continues, "
            "enforce blocks high severity and cleans medium severity."
        ),
    )
    llm_call_retention_days: int = Field(
        default=30,
        gt=0,
        validation_alias=AliasChoices(
            "LLM_CALL_RETENTION_DAYS", "llm_call_retention_days"
        ),
        description="Retention period in days for records in the llm_calls table.",
    )

    worker_notes_api_key: SecretStr | None = Field(
        default=None,
        description=(
            "MCP Guard API key for the A2A worker identity.  "
            "Must be a separate key from NOTES_AGENT_API_KEY with restricted "
            "scopes (notes:read and/or notes:write, never admin).  "
            "Required for POST /api/a2a/tasks/run."
        ),
    )
    analyst_window_hours: int = Field(
        default=24,
        ge=1,
        le=168,
        description="How far back incidents are built, in hours.",
    )
    analyst_incident_gap_minutes: int = Field(
        default=15,
        ge=1,
        le=240,
        description=(
            "Rows in the same group further apart than this start a new incident."
        ),
    )
    analyst_max_rows: int = Field(
        default=5000,
        ge=100,
        le=20000,
        description="Most audit rows read per grouping pass, newest first.",
    )
    analyst_max_events_per_prompt: int = Field(
        default=40,
        ge=5,
        le=100,
        description="Most events sent to the model for one incident.",
    )
    analyst_max_output_chars: int = Field(
        default=4000,
        ge=500,
        le=8000,
        description="Longest model reply accepted, before parsing.",
    )
    analyst_rate_limit_capacity: int = Field(
        default=3,
        gt=0,
        description="Bucket size for POST /api/analyst/explain, per key.",
    )
    analyst_rate_limit_per_minute: float = Field(
        default=3.0,
        gt=0,
        description="Refill per minute for POST /api/analyst/explain, per key.",
    )
    analyst_max_concurrency: int = Field(
        default=1,
        ge=1,
        le=4,
        description="Explanations running at once in this process.",
    )
    redis_url: SecretStr | None = Field(
        default=None,
        description="Valkey or Redis URL for state shared across API replicas.",
    )
    multi_instance: bool = Field(
        default=False,
        description="Refuse to start unless Postgres and REDIS_URL are both set.",
    )
    instance_id: str = Field(
        default_factory=socket.gethostname,
        description="Name shown by /ready. Defaults to the host name.",
    )
    db_pool_size: int = Field(
        default=5,
        gt=0,
        description="SQLAlchemy pool size for Postgres.",
    )
    db_max_overflow: int = Field(
        default=5,
        gt=0,
        description="Extra Postgres connections above the pool size.",
    )
    db_pool_timeout_s: float = Field(
        default=10,
        gt=0,
        description="Seconds to wait for a Postgres connection from the pool.",
    )
    db_pool_recycle_s: int = Field(
        default=1800,
        gt=0,
        description="Seconds before a pooled Postgres connection is recycled.",
    )
    ready_db_timeout_s: float = Field(
        default=2.0,
        gt=0,
        description="Seconds /ready waits for SELECT 1.",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, v: Any) -> Any:
        if isinstance(v, str):
            return normalize_database_url(v)
        return v

    @field_validator("injection_guard_mode", mode="before")
    @classmethod
    def strip_and_lower_guard_mode(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("environment", mode="before")
    @classmethod
    def strip_and_lower_environment(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("scanner_block_severities")
    @classmethod
    def validate_scanner_severities(cls, v: str) -> str:
        valid = {"critical", "high", "medium", "low"}
        for s in v.split(","):
            s = s.strip().lower()
            if s and s not in valid:
                raise ValueError(f"Invalid severity '{s}' in SCANNER_BLOCK_SEVERITIES")
        return v

    @field_validator("sandbox_notes_source", mode="before")
    @classmethod
    def blank_notes_source(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("upstream_fs_source", mode="before")
    @classmethod
    def blank_upstream_fs_source(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("upstream_fs_source")
    @classmethod
    def validate_upstream_fs_source(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not re.fullmatch(r"volume:[A-Za-z0-9_.-]+", v):
            raise ValueError(
                "UPSTREAM_FS_SOURCE must be in the form volume:<name> matching volume:[A-Za-z0-9_.-]+"
            )
        return v

    @field_validator(
        "groq_api_key",
        "notes_agent_api_key",
        "worker_notes_api_key",
        "redis_url",
        mode="before",
    )
    @classmethod
    def blank_optional_secret(cls, value: Any) -> Any:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("ollama_base_url")
    @classmethod
    def ollama_http_url(cls, value: str) -> str:
        text = value.strip().rstrip("/")
        parts = urlsplit(text)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            raise ValueError("OLLAMA_BASE_URL must be an http or https URL")
        return text

    @property
    def is_development(self) -> bool:
        return self.environment in {"dev", "development", "local"}

    @property
    def is_production_like(self) -> bool:
        return self.environment not in {"dev", "development", "local", "test"}

    def model_post_init(self, context: object, /) -> None:
        del context
        self.notes_dir = Path(self.notes_dir).expanduser().resolve()
        self.upstream_fs_dir = Path(self.upstream_fs_dir).expanduser().resolve()
        if _path_breaks_mount(str(self.upstream_fs_dir)):
            raise ValueError(
                "UPSTREAM_FS_DIR path must not contain commas or equals signs"
            )

        if self.is_production_like and not self.api_key_pepper:
            raise ValueError("API_KEY_PEPPER is required in production environment")

        if (
            self.is_production_like
            and self.api_key_pepper is not None
            and _pepper_is_placeholder(self.api_key_pepper)
        ):
            raise ValueError("API_KEY_PEPPER is a placeholder; set a long random value")

        if self.is_production_like:
            # An unset mode follows the safe production default. An explicit
            # value, including warn, is left alone and checked below.
            if "tool_pinning_mode" not in self.model_fields_set:
                self.tool_pinning_mode = "enforce"
            if "injection_guard_mode" not in self.model_fields_set:
                self.injection_guard_mode = "enforce"

        if self.multi_instance and (
            self.database_url.startswith("sqlite") or self.redis_url is None
        ):
            raise ValueError(
                "MULTI_INSTANCE requires a Postgres DATABASE_URL and REDIS_URL"
            )

        if self.is_production_like and self.tool_pinning_bootstrap_approve:
            raise ValueError(
                "TOOL_PINNING_BOOTSTRAP_APPROVE is not allowed in production"
            )

        if self.is_production_like and self.demo_poison_tool:
            raise ValueError("MCPG_DEMO_POISON_TOOL is not allowed in production")

        if self.is_production_like and self.upstream_lab_enabled:
            raise ValueError("UPSTREAM_LAB_ENABLED is not allowed in production")

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
        if self.injection_guard_mode == "off":
            raise ValueError("INJECTION_GUARD_MODE=off is not allowed in production")

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


def warn_explicit_production_modes() -> None:
    """Log when production explicitly chooses warn instead of enforce.

    Called from lifespan so importing settings stays quiet.
    """

    if not settings.is_production_like:
        return
    import logging

    logger = logging.getLogger(__name__)
    if (
        "tool_pinning_mode" in settings.model_fields_set
        and settings.tool_pinning_mode == "warn"
    ):
        logger.warning(
            "TOOL_PINNING_MODE=warn in production; an unset mode defaults to enforce"
        )
    if (
        "injection_guard_mode" in settings.model_fields_set
        and settings.injection_guard_mode == "warn"
    ):
        logger.warning(
            "INJECTION_GUARD_MODE=warn in production; an unset mode defaults to enforce"
        )

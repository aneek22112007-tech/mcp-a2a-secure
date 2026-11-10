# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# Install uv binary from the official Astral image
COPY --from=ghcr.io/astral-sh/uv:0.6.2 /uv /bin/uv

# Copy dependency specifications for layer caching
COPY pyproject.toml uv.lock ./

# Install locked production dependencies into /app/.venv without editable project
RUN uv sync --frozen --no-dev --no-install-project

# -----------------------------------------------------------------------------
# Runtime stage
# -----------------------------------------------------------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app"

WORKDIR /app

# Install Docker CLI static binary from official docker:cli
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

# Install runtime utilities: curl for health check and gosu for non-root privilege step-down
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder stage
COPY --from=builder /app/.venv /app/.venv

# Copy Alembic database migration configuration and scripts
COPY alembic.ini ./
COPY alembic ./alembic

# Copy application source tree
COPY app ./app

# Copy auxiliary scripts
COPY scripts ./scripts

# Copy entrypoint script
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create local data directories with UID 65534 (nobody:nogroup) ownership
RUN mkdir -p /app/data/notes /app/data/shared \
    && chown -R 65534:65534 /app/data

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]

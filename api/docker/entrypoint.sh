#!/bin/sh
set -e

echo "==> MCP Guard API Container Entrypoint"

# 1. Run database migrations first
echo "==> Running Alembic migrations (alembic upgrade head)..."
alembic upgrade head
echo "==> Alembic migrations completed successfully."

# 2. Configure non-root permissions and Docker socket access where feasible
APP_USER="nobody"

if [ -S /var/run/docker.sock ]; then
    SOCK_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || echo "")
    if [ -n "$SOCK_GID" ] && [ "$SOCK_GID" != "0" ]; then
        if [ "$(id -u)" = "0" ]; then
            if ! getent group "$SOCK_GID" >/dev/null 2>&1; then
                groupadd -g "$SOCK_GID" -f docker-host 2>/dev/null || true
            fi
            usermod -aG "$SOCK_GID" "$APP_USER" 2>/dev/null || true
        fi
    fi
fi

if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/data/notes /app/data/shared
    chown -R 65534:65534 /app/data
fi

# 3. Start Uvicorn, replacing the shell process to preserve signal handling
echo "==> Starting Uvicorn server on 0.0.0.0:8000..."
if [ "$(id -u)" = "0" ]; then
    # If running as root, attempt to step down to nobody (UID 65534)
    # If Docker socket is present but nobody cannot access it, stay root so sandbox executor functions
    if [ -S /var/run/docker.sock ]; then
        if ! gosu "$APP_USER" docker version >/dev/null 2>&1; then
            if docker version >/dev/null 2>&1; then
                echo "==> Notice: Docker socket requires root permissions on this host. Running as root."
                exec uvicorn app.main:app --host 0.0.0.0 --port 8000
            fi
        fi
    fi
    exec gosu "$APP_USER" uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

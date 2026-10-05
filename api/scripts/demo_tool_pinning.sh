#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== MCP Guard tool pinning demo ==="
echo "Applying database migrations..."
uv run alembic upgrade head

echo "Generating temporary admin key..."
ADMIN_KEY=$(uv run python scripts/create_admin_key.py --force | grep "API Key:" | awk '{print $3}')

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Failed to create admin key. Is the database initialized?"
  exit 1
fi

echo "Created temporary admin key for demo."

PORT=8091
export SANDBOX_MODE="${SANDBOX_MODE:-inprocess}"
export TOOL_PINNING_MODE=enforce
export TOOL_PINNING_BOOTSTRAP_APPROVE=false

echo "Starting API server on port $PORT (pinning: enforce, sandbox: $SANDBOX_MODE)..."
uv run uvicorn app.main:app --port "$PORT" --host 127.0.0.1 > /tmp/mcp-guard-pin-demo.log 2>&1 &
API_PID=$!

function cleanup {
  echo "Shutting down API server (PID: $API_PID)..."
  kill "$API_PID" >/dev/null 2>&1 || true
  wait "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ "$ready" != "1" ]]; then
  echo "API server did not become ready. Log:"
  cat /tmp/mcp-guard-pin-demo.log
  exit 1
fi

function expect_status {
  local expected="$1"
  local label="$2"
  shift 2
  local body
  body=$(mktemp)
  local code
  code=$(curl -s -o "$body" -w "%{http_code}" "$@")
  if [[ "$code" != "$expected" ]]; then
    echo "$label expected HTTP $expected, got $code"
    cat "$body"
    echo
    rm -f "$body"
    exit 1
  fi
  echo "$label HTTP $code"
  cat "$body"
  echo
  rm -f "$body"
}

AUTH=( -H "Authorization: Bearer $ADMIN_KEY" )
JSON=( -H "Content-Type: application/json" )

echo "------------------------------------------------"
echo "1. PUT /api/notes/pin-demo before any approval"
expect_status 403 "unapproved write" "${AUTH[@]}" "${JSON[@]}" \
  -X PUT "http://127.0.0.1:$PORT/api/notes/pin-demo" \
  -d '{"content":"not yet"}'

echo "------------------------------------------------"
echo "2. POST /api/pins/sync"
expect_status 200 "sync" "${AUTH[@]}" -X POST "http://127.0.0.1:$PORT/api/pins/sync"

echo "------------------------------------------------"
echo "3. PUT still denied while the pin is only pending"
expect_status 403 "pending write" "${AUTH[@]}" "${JSON[@]}" \
  -X PUT "http://127.0.0.1:$PORT/api/notes/pin-demo" \
  -d '{"content":"still pending"}'

echo "------------------------------------------------"
echo "4. POST /api/pins/write_note/approve"
expect_status 200 "approve write_note" "${AUTH[@]}" "${JSON[@]}" \
  -X POST "http://127.0.0.1:$PORT/api/pins/write_note/approve" \
  -d '{"note":"demo"}'

echo "------------------------------------------------"
echo "5. PUT /api/notes/pin-demo after approval"
expect_status 200 "approved write" "${AUTH[@]}" "${JSON[@]}" \
  -X PUT "http://127.0.0.1:$PORT/api/notes/pin-demo" \
  -d '{"content":"pinned write"}'

echo "------------------------------------------------"
echo "6. POST /api/pins/write_note/revoke"
expect_status 200 "revoke write_note" "${AUTH[@]}" "${JSON[@]}" \
  -X POST "http://127.0.0.1:$PORT/api/pins/write_note/revoke" \
  -d '{"note":"demo revoke"}'

echo "------------------------------------------------"
echo "7. PUT denied again after revoke"
expect_status 403 "revoked write" "${AUTH[@]}" "${JSON[@]}" \
  -X PUT "http://127.0.0.1:$PORT/api/notes/pin-demo" \
  -d '{"content":"revoked"}'

echo "------------------------------------------------"
echo "8. GET /api/pins without a key"
expect_status 401 "missing key" "http://127.0.0.1:$PORT/api/pins"

echo "------------------------------------------------"
echo "Demo finished successfully."

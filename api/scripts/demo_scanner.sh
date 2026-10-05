#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== MCP Guard Tool Poisoning Scanner Demo ==="
echo "Generating temporary admin key..."

# Use --force to ensure we get a key even if one exists.
ADMIN_KEY=$(uv run python scripts/create_admin_key.py --force | grep "API Key:" | awk '{print $3}')

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Failed to create admin key. Is the database initialized?"
  exit 1
fi

echo "Created temporary admin key for demo."

PORT=8091
export TOOL_PINNING_MODE=enforce
export SCANNER_ENABLED=true

echo "Starting API server in the background on port $PORT (TOOL_PINNING_MODE=$TOOL_PINNING_MODE)..."
uv run uvicorn app.main:app --port $PORT --host 127.0.0.1 > /dev/null 2>&1 &
API_PID=$!

sleep 2

function cleanup {
  echo "Shutting down API server (PID: $API_PID)..."
  kill $API_PID
  wait $API_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "------------------------------------------------"
echo "1. Approve current tools"
curl -s -f -X POST -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/pins/sync | uv run python -m json.tool

echo "------------------------------------------------"
echo "2. POST /api/scanner/run"
curl -s -f -X POST -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/scanner/run | uv run python -m json.tool

echo "------------------------------------------------"
echo "3. GET /api/scanner/findings (should be 0 for stock tools)"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/scanner/findings | uv run python -m json.tool

echo "------------------------------------------------"
echo "4. Request /api/scanner/run without key and verify 401"
RES=$(curl -s -i -X POST http://127.0.0.1:$PORT/api/scanner/run)
if echo "$RES" | grep -q "401 Unauthorized"; then
    echo "Verified 401 Unauthorized without key."
else
    echo "Failed to verify 401. Response was:"
    echo "$RES"
    exit 1
fi

echo "------------------------------------------------"
echo "Demo finished successfully!"

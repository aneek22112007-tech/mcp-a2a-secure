#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== MCP Guard Sandbox Demo ==="
echo "Generating temporary admin key..."

# We need an admin key to query sandbox runs and metrics.
# Use --force to ensure we get a key even if one exists.
ADMIN_KEY=$(uv run python scripts/create_admin_key.py --force | grep "API Key:" | awk '{print $3}')

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Failed to create admin key. Is the database initialized?"
  exit 1
fi

echo "Created temporary admin key for demo."

PORT=8090

# Default to in-process if SANDBOX_MODE is not set
export SANDBOX_MODE=${SANDBOX_MODE:-inprocess}

echo "Starting API server in the background on port $PORT (mode: $SANDBOX_MODE)..."
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
echo "1. GET /api/sandbox/health"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/sandbox/health | uv run python -m json.tool

echo "------------------------------------------------"
echo "2. PUT /api/notes/demo-sandbox"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" -X PUT http://127.0.0.1:$PORT/api/notes/demo-sandbox -d '{"content": "Sandbox test"}' -H "Content-Type: application/json" > /dev/null
echo "Successfully created note."

echo "------------------------------------------------"
echo "3. GET the note"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/notes/demo-sandbox | uv run python -m json.tool

echo "------------------------------------------------"
echo "4. GET a missing note (should fail)"
curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/notes/demo-missing | uv run python -m json.tool || true

echo "------------------------------------------------"
echo "5. GET /api/sandbox/runs?limit=5"
RUNS_JSON=$(curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/sandbox/runs?limit=5)
echo "$RUNS_JSON" | uv run python -m json.tool

echo "------------------------------------------------"
echo "6. GET /api/sandbox/runs/{first id}"
# Extract first ID (if any)
FIRST_ID=$(echo "$RUNS_JSON" | uv run python -c "import sys, json; data=json.load(sys.stdin); print(data['items'][0]['id'] if data.get('items') else '')")
if [[ -n "$FIRST_ID" ]]; then
    curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/sandbox/runs/$FIRST_ID | uv run python -m json.tool
else
    echo "No sandbox runs found to query by ID."
fi

echo "------------------------------------------------"
echo "7. Print sandbox section of GET /api/metrics"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/metrics | uv run python -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data.get('sandbox', {}), indent=4))"

echo "------------------------------------------------"
echo "8. Request /api/sandbox/runs without key and verify 401"
RES=$(curl -s -i http://127.0.0.1:$PORT/api/sandbox/runs)
if echo "$RES" | grep -q "401 Unauthorized"; then
    echo "Verified 401 Unauthorized without key."
else
    echo "Failed to verify 401. Response was:"
    echo "$RES"
    exit 1
fi

echo "------------------------------------------------"
echo "Demo finished successfully!"

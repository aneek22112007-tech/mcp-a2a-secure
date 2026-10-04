#!/usr/bin/env bash
set -e

# Change to the api directory to ensure scripts run correctly
cd "$(dirname "$0")/.."

echo "=== MCP Guard Rate Limiter & Audit Demo ==="
echo "Generating temporary admin key..."

# We need an admin key to query audit and metrics.
# Use --force to ensure we get a key even if one exists.
ADMIN_KEY=$(uv run python scripts/create_admin_key.py --force | grep "API Key:" | awk '{print $3}')

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Failed to create admin key. Is the database initialized?"
  exit 1
fi

echo "Created temporary admin key for demo."

# Start API on a dynamic port
PORT=8089

# We need the API running in the background. We will use a fast rate limit
# for demonstration purposes.
export RATE_LIMIT_CAPACITY=2
export RATE_LIMIT_REFILL_RATE_PER_SEC=1.0

echo "Starting API server in the background on port $PORT..."
uv run uvicorn app.main:app --port $PORT --host 127.0.0.1 > /dev/null 2>&1 &
API_PID=$!

# Wait for API to be ready
sleep 2

function cleanup {
  echo "Shutting down API server (PID: $API_PID)..."
  kill $API_PID
  wait $API_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "------------------------------------------------"
echo "1. Authorized Audit Query"
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/audit?limit=1 > /dev/null
echo "Successfully queried /api/audit"

echo "------------------------------------------------"
echo "2. Successful Protected Operation"
curl -s -H "Authorization: Bearer $ADMIN_KEY" -X PUT http://127.0.0.1:$PORT/api/notes/test-note -d '{"content": "Hello"}' -H "Content-Type: application/json" > /dev/null
echo "Called write_note"

echo "------------------------------------------------"
echo "3. Denied/Failed Operation"
curl -s -X PUT http://127.0.0.1:$PORT/api/notes/test-note -d '{"content": "Hello"}' -H "Content-Type: application/json" > /dev/null
echo "Called write_note without auth (should be 401)"

echo "------------------------------------------------"
echo "4. Triggering Rate Limit (Capacity is 2, we already used 1 token for audit, 1 for write_note)"
curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/audit?limit=1 > /dev/null || true
curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/audit?limit=1 > /dev/null || true
RES=$(curl -s -i -H "Authorization: Bearer $ADMIN_KEY" -X PUT http://127.0.0.1:$PORT/api/notes/test-note2 -d '{"content": "Hello"}' -H "Content-Type: application/json")
if echo "$RES" | grep -q "429 Too Many Requests"; then
    echo "Rate limit triggered (HTTP 429)"
    RETRY_AFTER=$(echo "$RES" | grep -i "Retry-After" | tr -d '\r')
    echo "$RETRY_AFTER"
else
    echo "Failed to trigger rate limit."
    echo "$RES"
    exit 1
fi

echo "------------------------------------------------"
echo "5. Checking Audit Log for Rate Limit Rejection"
sleep 1.5
AUDIT_RES=$(curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/audit?limit=10)
if echo "$AUDIT_RES" | grep -q "rate_limit_exceeded"; then
    echo "Found 'rate_limit_exceeded' in audit log!"
else
    echo "Rate limit event not found in audit log."
    exit 1
fi

echo "------------------------------------------------"
echo "6. Metrics Summary Request"
METRICS_RES=$(curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:$PORT/api/metrics)
if echo "$METRICS_RES" | grep -q "rate_limit_rejections"; then
    echo "Successfully queried metrics"
    echo "$METRICS_RES" | grep -o '"totals":{[^}]*}'
else
    echo "Failed to get metrics."
    exit 1
fi

echo "------------------------------------------------"
echo "7. Retention Cleanup Preview (Dry Run)"
uv run python scripts/prune_audit.py --dry-run
echo "Dry-run completed."

echo "------------------------------------------------"
echo "Demo finished successfully!"

#!/usr/bin/env bash
set -e

# Change to the api directory to ensure scripts run correctly
cd "$(dirname "$0")/.."

echo "=== MCP Guard Rate Limiter & Audit Demo ==="
echo "Generating temporary admin key..."

# We need an admin key to query audit and metrics. The create_admin_key.py
# prints the key on the last line.
ADMIN_KEY=$(uv run scripts/create_admin_key.py --client-id "demo-script" --quiet 2>/dev/null | tail -n 1)

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Failed to create admin key. Is the database initialized?"
  exit 1
fi

echo "Created temporary admin key for demo."

# We need the API running in the background. We will use a fast rate limit
# for demonstration purposes.
export RATE_LIMIT_CAPACITY=2
export RATE_LIMIT_REFILL_RATE_PER_SEC=1.0

echo "Starting API server in the background..."
uv run uvicorn app.main:app --port 8000 --host 127.0.0.1 > /dev/null 2>&1 &
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
curl -s -f -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:8000/api/audit?limit=1 > /dev/null
echo "✓ Successfully queried /api/audit"

echo "------------------------------------------------"
echo "2. Successful Protected Operation"
# We call a tool through the REST gateway. Let's call list_notes.
curl -s -H "Authorization: Bearer $ADMIN_KEY" -X POST http://127.0.0.1:8000/api/notes/test-note -d "Hello" > /dev/null
echo "✓ Called write_note"

echo "------------------------------------------------"
echo "3. Denied/Failed Operation"
curl -s -X POST http://127.0.0.1:8000/api/notes/test-note -d "Hello" > /dev/null
echo "✓ Called write_note without auth (should be 401)"

echo "------------------------------------------------"
echo "4. Triggering Rate Limit (Capacity is 2, we already used 1 token for audit, 1 for write_note)"
# The first requests might have consumed the tokens.
# Let's make some more requests to guarantee a 429.
curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:8000/api/audit?limit=1 > /dev/null || true
curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:8000/api/audit?limit=1 > /dev/null || true
RES=$(curl -s -i -H "Authorization: Bearer $ADMIN_KEY" -X POST http://127.0.0.1:8000/api/notes/test-note2 -d "Hello")
if echo "$RES" | grep -q "429 Too Many Requests"; then
    echo "✓ Rate limit triggered (HTTP 429)"
    RETRY_AFTER=$(echo "$RES" | grep -i "Retry-After" | tr -d '\r')
    echo "✓ $RETRY_AFTER"
else
    echo "✗ Failed to trigger rate limit."
    echo "$RES"
    exit 1
fi

echo "------------------------------------------------"
echo "5. Checking Audit Log for Rate Limit Rejection"
# Wait a second for token to refill so we can query audit again
sleep 1.5
AUDIT_RES=$(curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:8000/api/audit?limit=10)
if echo "$AUDIT_RES" | grep -q "rate_limit_exceeded"; then
    echo "✓ Found 'rate_limit_exceeded' in audit log!"
else
    echo "✗ Rate limit event not found in audit log."
    exit 1
fi

echo "------------------------------------------------"
echo "6. Metrics Summary Request"
METRICS_RES=$(curl -s -H "Authorization: Bearer $ADMIN_KEY" http://127.0.0.1:8000/api/metrics/summary)
if echo "$METRICS_RES" | grep -q "rate_limit_rejections"; then
    echo "✓ Successfully queried metrics summary"
    # Pretty print the totals
    echo "$METRICS_RES" | grep -o '"totals":{[^}]*}'
else
    echo "✗ Failed to get metrics summary."
    exit 1
fi

echo "------------------------------------------------"
echo "7. Retention Cleanup Preview (Dry Run)"
uv run scripts/cleanup_audit.py --dry-run
echo "✓ Dry-run completed."

echo "------------------------------------------------"
echo "Demo finished successfully!"

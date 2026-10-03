#!/usr/bin/env bash
#
# demo_auth.sh
# Demonstrates API key authentication and authorization behavior.
#

set -euo pipefail

: "${API_BASE_URL:?API_BASE_URL must be set (e.g. http://127.0.0.1:8000)}"
: "${READ_ONLY_KEY:?READ_ONLY_KEY must be set (needs notes:read scope)}"
: "${DEMO_ADMIN_KEY:?DEMO_ADMIN_KEY must be set (needs admin scope)}"

# Ensure we're in a dev/local environment
if [[ "${ENVIRONMENT:-dev}" == "production" ]]; then
    echo "This script should not be run in a production environment."
    exit 1
fi

echo "Waiting for API to be available..."
if ! curl -s -f "$API_BASE_URL/health" > /dev/null; then
    echo "API is not running at $API_BASE_URL. Please start it first."
    exit 1
fi
echo "API is up."
echo

# ------------------------------------------------------------------
# Scenario 1: Read succeeds
# ------------------------------------------------------------------
echo "Scenario 1: Read with read-only key (expects 200)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $READ_ONLY_KEY" "$API_BASE_URL/api/notes/")
echo "HTTP Status: $STATUS"
if [[ "$STATUS" != "200" ]]; then
    echo "FAIL: Expected 200, got $STATUS"
    exit 1
fi
echo "PASS"
echo

# ------------------------------------------------------------------
# Scenario 2: Write is forbidden
# ------------------------------------------------------------------
echo "Scenario 2: Write with read-only key (expects 403)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $READ_ONLY_KEY" -H "Content-Type: application/json" -d '{"title": "test", "content": "test"}' "$API_BASE_URL/api/notes/")
echo "HTTP Status: $STATUS"
if [[ "$STATUS" != "403" ]]; then
    echo "FAIL: Expected 403, got $STATUS"
    exit 1
fi
echo "PASS"
echo

# ------------------------------------------------------------------
# Scenario 3: Missing key is rejected
# ------------------------------------------------------------------
echo "Scenario 3: Missing key (expects 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL/api/notes/")
echo "HTTP Status: $STATUS"
if [[ "$STATUS" != "401" ]]; then
    echo "FAIL: Expected 401, got $STATUS"
    exit 1
fi
echo "PASS"
echo

# ------------------------------------------------------------------
# Scenario 4: Revocation takes effect
# ------------------------------------------------------------------
echo "Scenario 4: Revoking key and retesting (expects 401)"
# 1. We need to find the key ID for the read-only key. We'll use the admin key to list keys.
# We'll just grab the key prefix and find the key ID.
PREFIX="${READ_ONLY_KEY:5:8}" # Assuming mcpg_<8>_<...>
KEY_ID=$(curl -s -H "Authorization: Bearer $DEMO_ADMIN_KEY" "$API_BASE_URL/api/keys?client_id=demo_client" | grep -B 3 "\"key_prefix\":\"$PREFIX\"" | grep "\"id\"" | cut -d '"' -f 4 || true)

if [[ -z "$KEY_ID" ]]; then
    echo "Wait, the read-only key must belong to a client named 'demo_client' for this demo to revoke it easily."
    echo "Let's try revoking it by just searching all keys."
    # For a real script we might use a dedicated setup, but we'll try to find it.
    KEY_ID=$(curl -s -H "Authorization: Bearer $DEMO_ADMIN_KEY" "$API_BASE_URL/api/keys?client_id=1" | grep -B 3 "\"key_prefix\":\"$PREFIX\"" | grep "\"id\"" | cut -d '"' -f 4 | head -n 1)
fi

if [[ -z "$KEY_ID" ]]; then
    echo "Could not find key ID for prefix $PREFIX. Ensure the key exists."
    exit 1
fi

echo "Revoking key $KEY_ID..."
curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $DEMO_ADMIN_KEY" "$API_BASE_URL/api/keys/$KEY_ID"

echo "Retrying read with revoked key..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $READ_ONLY_KEY" "$API_BASE_URL/api/notes/")
echo "HTTP Status: $STATUS"
if [[ "$STATUS" != "401" ]]; then
    echo "FAIL: Expected 401, got $STATUS"
    exit 1
fi
echo "PASS"
echo

echo "All scenarios passed!"

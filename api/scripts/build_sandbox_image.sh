#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker build \
    -f sandbox/Dockerfile \
    -t "${SANDBOX_IMAGE:-mcp-guard-tool-runner:local}" \
    .

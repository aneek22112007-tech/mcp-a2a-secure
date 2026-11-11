#!/bin/sh
# Build mcp-guard-upstream-lab versioned container images.
#
# Usage:
#   ./api/scripts/build_upstream_lab_image.sh          # Builds v1, v2, and tags current -> v1
#   ./api/scripts/build_upstream_lab_image.sh use v1   # Points current -> v1
#   ./api/scripts/build_upstream_lab_image.sh use v2   # Points current -> v2

set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
context_dir="${root}/api/docker/upstream-lab"
dockerfile="${context_dir}/Dockerfile"

if [ $# -eq 0 ]; then
    echo "Building mcp-guard-upstream-lab:v1..."
    docker build \
        --build-arg "LAB_CONTRACT=v1" \
        -t "mcp-guard-upstream-lab:v1" \
        -f "${dockerfile}" \
        "${context_dir}"

    echo "Building mcp-guard-upstream-lab:v2..."
    docker build \
        --build-arg "LAB_CONTRACT=v2" \
        -t "mcp-guard-upstream-lab:v2" \
        -f "${dockerfile}" \
        "${context_dir}"

    echo "Tagging mcp-guard-upstream-lab:current -> v1..."
    docker tag "mcp-guard-upstream-lab:v1" "mcp-guard-upstream-lab:current"
    echo "Done."
elif [ $# -eq 2 ] && [ "$1" = "use" ] && [ "$2" = "v1" ]; then
    echo "Pointing mcp-guard-upstream-lab:current -> v1..."
    docker tag "mcp-guard-upstream-lab:v1" "mcp-guard-upstream-lab:current"
    echo "Done."
elif [ $# -eq 2 ] && [ "$1" = "use" ] && [ "$2" = "v2" ]; then
    echo "Pointing mcp-guard-upstream-lab:current -> v2..."
    docker tag "mcp-guard-upstream-lab:v2" "mcp-guard-upstream-lab:current"
    echo "Done."
else
    echo "Usage: $0 [use v1|use v2]" >&2
    exit 2
fi

#!/bin/sh
# Build mcp-guard-upstream-fs:<version> from the official npm package.
# Default version is 2.2.0. Pass another version to build that tag:
#   ./api/scripts/build_upstream_fs_image.sh 2.1.0
set -eu

version="${1:-2.2.0}"
case "$version" in
  *[!A-Za-z0-9._-]*)
    echo "version must contain only letters, numbers, dots, underscores and hyphens" >&2
    exit 2
    ;;
esac

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
docker build \
  --build-arg "FS_VERSION=${version}" \
  -t "mcp-guard-upstream-fs:${version}" \
  -f "${root}/api/docker/upstream-fs/Dockerfile" \
  "${root}/api/docker/upstream-fs"

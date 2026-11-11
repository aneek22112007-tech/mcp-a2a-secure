# Filesystem upstream

MCP Guard can register the official `@modelcontextprotocol/server-filesystem`
server as gateway tools. The tools are named `fs_` plus the upstream name, so
`read_text_file` is `fs_read_text_file`. Descriptions and input schemas are
copied from the server's `tools/list`. Output schemas and annotations are not
copied and are not part of the pin hash.

The upstream is off unless `UPSTREAM_FS_ENABLED=true`. A missing image, a
container that exits, or a Docker CLI that cannot start leaves the API up and
registers no `fs_` tools. The notes tools are unchanged.

The filesystem upstream shares the generic `UpstreamSpec` architecture with the hostile lab upstream ([UPSTREAM_LAB.md](UPSTREAM_LAB.md)). The shared upstream registry and container runner manage tool discovery, container execution, pre-call contract drift checks, output size limits, output injection guard inspection, and audit event persistence, while filesystem-specific policies (such as path confinement within `/projects`, traversal validation, and read vs. write mount modes) remain encapsulated in the filesystem spec.

## Image

From the repository root:

```bash
./api/scripts/build_upstream_fs_image.sh
./api/scripts/build_upstream_fs_image.sh 2.1.0
```

The default tag is `mcp-guard-upstream-fs:2.2.0`. The script's argument is the
npm version and the image tag. The image is `node:24-alpine` with that package
installed globally. The process user in the image is `65534:65534`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_FS_ENABLED` | `false` | Register `fs_` tools at startup |
| `UPSTREAM_FS_IMAGE` | `mcp-guard-upstream-fs:2.2.0` | Image used for discovery and for every call |
| `UPSTREAM_FS_DIR` | `api/data/shared` | Host directory mounted at `/projects` |
| `UPSTREAM_FS_TIMEOUT_S` | `30` | Seconds for one filesystem container, including process startup. This is separate from `SANDBOX_TIMEOUT_S`, which is sized for the notes runner |

`Settings()` does not create `UPSTREAM_FS_DIR`. The directory is created on
first use with mode `0755`; an existing directory keeps its permissions.
Nothing is written into it at startup. With native Docker on Linux, write
tools need the directory to be writable by the `SANDBOX_RUN_AS` uid. Docker
Desktop maps ownership to the host user. `api/data/` is gitignored.

The path must not contain a comma or an equals sign. Those characters would
change the meaning of `docker --mount`.

## What a call does

Every `fs_` call starts its own container and removes it when the call
finishes, including on timeout. The container has no network, a read-only
root, no capabilities, no new privileges, a pid limit, a 256 MiB memory limit,
and a file-descriptor limit of 256. `/tmp` is a 64 MiB tmpfs. The notes runner
uses 128 MiB and 64 file descriptors; Node needs the higher limits. The
container user is `SANDBOX_RUN_AS` (default `65534:65534`).

The command is `mcp-server-filesystem --confine-roots /projects`. The client
handshake does not advertise the roots capability, so a client cannot replace
the mounted directory. `--read-only` is not passed to the server: that flag
drops the write tools from `tools/list`. Read tools get the host directory
mounted read-only. Write tools get a read-write mount.

The run is stored in `sandbox_runs` with mode `docker` and `UPSTREAM_FS_IMAGE`.
Discovery at startup is not a sandbox run. Tool text and upstream errors go
through the injection guard.

## Scopes

`/mcp/` still requires `agent:run`. The tool then needs its own scope:

| Scope | Tools |
|---|---|
| `files:read` | `fs_read_file`, `fs_read_text_file`, `fs_read_media_file`, `fs_read_multiple_files`, `fs_list_directory`, `fs_list_directory_with_sizes`, `fs_directory_tree`, `fs_search_files`, `fs_get_file_info`, `fs_list_allowed_directories` |
| `files:write` | `fs_write_file`, `fs_edit_file`, `fs_create_directory`, `fs_move_file`, `fs_append_file`, `fs_copy_file` |

A name the server adds later is registered with no scope. The call is denied
as an unmapped tool. `GET /api/upstreams` (`tools:read`) reports whether the
filesystem upstream is enabled and which public names were registered.

The notes agent and A2A workers are not given these tools. They still call
`list_notes`, `read_note`, and `write_note`.

## Paths

Arguments named `path`, `source`, `destination`, and entries of `paths` must
stay inside `/projects`. An empty path, a NUL, a `..` segment, or an absolute
path outside `/projects` is refused. A symlink anywhere on the host path is
refused. The error text does not include the host path.

## Pins and a contract change

Pinning hashes the public name, the description, and the input schema. With
`TOOL_PINNING_MODE=enforce`, an `fs_` tool is hidden and returns 403 until
that hash is approved.

Each call also lists the tools inside that call's container and compares the
called tool with the schema captured at startup. A difference is refused
before the tool runs. The audit action is `tool.pin.drift` and the reason is
`upstream_contract_changed`. The client text is `Upstream error: Upstream tool
contract changed since startup`. Other tools from the same startup are not
refused by that check.

Restarting after the image tag points at different server code loads the new
schemas. Approved pins from the previous schemas then show `matches: false`,
and enforce mode returns 403 with reason `pin_drift`. Tools that did not exist
when the pins were approved have no approved pin.

## Output and time limits

The joined tool text is capped at `SANDBOX_MAX_OUTPUT_BYTES`. A timeout uses
`UPSTREAM_FS_TIMEOUT_S`, then the container is killed and removed. `docker ps -a
--filter label=mcp_guard.sandbox=1` should be empty after the call returns.

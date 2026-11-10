# Official filesystem MCP server, pinned by npm version.
# The API starts one container per fs_ call and passes the allowed directory
# on the command line. Build with api/scripts/build_upstream_fs_image.sh.
FROM node:24-alpine

ARG FS_VERSION=2.2.0

RUN npm install -g "@modelcontextprotocol/server-filesystem@${FS_VERSION}" \
    && mkdir -p /projects \
    && chown 65534:65534 /projects

ENV HOME=/tmp \
    NODE_ENV=production

USER 65534:65534
WORKDIR /tmp

ENTRYPOINT ["mcp-server-filesystem"]
CMD ["--confine-roots", "/projects"]

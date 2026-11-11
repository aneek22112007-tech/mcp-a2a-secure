# Hostile Lab MCP Server for MCP Guard Gateway security testing.
# WARNING: Never deploy this lab image to production environments.
# Build with api/scripts/build_upstream_lab_image.sh.
FROM python:3.11-slim

ARG LAB_CONTRACT=v1
ENV LAB_CONTRACT=${LAB_CONTRACT} \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp

WORKDIR /lab

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

USER 65534:65534
WORKDIR /tmp

ENTRYPOINT ["python", "/lab/server.py"]

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# python -I does not put the working directory on sys.path. A site .pth
# adds /opt/runner so `python -I -m app.tools.runner` can import the package.
COPY app/__init__.py /opt/runner/app/__init__.py
COPY app/tools /opt/runner/app/tools
RUN python -c "import pathlib, site; pathlib.Path(site.getsitepackages()[0], 'mcpg-runner.pth').write_text('/opt/runner\n')"

USER 65534:65534
WORKDIR /opt/runner
ENTRYPOINT ["python", "-I", "-m", "app.tools.runner"]

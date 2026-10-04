# Backend API image (FastAPI + uvicorn) for container hosts (Render, Koyeb, Fly.io, Cloud Run, Docker
# Compose). The main deployment runs the same app as a Vercel Python function (api/index.py).
# The host sets $PORT (default 8000).
FROM python:3.12-slim

# APP_ENV=production: strict database mode, JSON logs, dev endpoints hard-off, proxy-aware client IPs.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    APP_ENV=production

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend backend

RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health', timeout=4)"
# One worker: the free instance has 512 MB, and state lives in MongoDB anyway.
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --timeout-keep-alive 30"]

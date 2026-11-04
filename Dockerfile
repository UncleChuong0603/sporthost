# Keep Python 3.12 aligned with .python-version; registry digest audited 2026-11-02.
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production PORT=8000
WORKDIR /srv/sporthost
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
RUN groupadd --gid 10001 sporthost && useradd --uid 10001 --gid sporthost --no-create-home sporthost \
    && mkdir -p /data/uploads && chown sporthost:sporthost /data/uploads
COPY app ./app
COPY public ./public
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/ready',timeout=3)"
# Alembic migrations are a separate, explicitly authorized operator action.
# Never run migration automatically as part of web container startup.
CMD ["python", "-m", "scripts.serve"]

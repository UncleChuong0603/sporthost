# Development/staging image only. Public launch needs hardening per SPRINT_0_1.md.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/clubhost
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY public ./public
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts
EXPOSE 8000
# Alembic migrations are a separate, explicitly authorized operator action.
# Never run migration automatically as part of web container startup.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

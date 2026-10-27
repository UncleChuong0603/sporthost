import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.settings import load_settings


def configure_vercel(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('APP_ENV', raising=False)
    monkeypatch.setenv('SECRET_KEY', 'test-secret-for-vercel-deployment-configuration')
    monkeypatch.setenv('COOKIE_SECURE', 'true')
    monkeypatch.setenv('DB_SCHEMA', 'clubhost')


def test_vercel_accepts_provider_url_and_defaults_to_production(monkeypatch):
    configure_vercel(monkeypatch)
    monkeypatch.setenv('DATABASE_URL', 'postgres://beta:pass@db.example/beta?sslmode=require')
    settings = load_settings()
    assert settings['env'] == 'production'
    assert settings['url'] == 'postgresql+psycopg://beta:pass@db.example/beta?sslmode=require'
    assert settings['serverless'] is True


def test_vercel_rejects_ephemeral_sqlite_even_with_development_env(monkeypatch):
    configure_vercel(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('DATABASE_URL', 'sqlite:////tmp/sporthost.db')
    with pytest.raises(RuntimeError, match='PostgreSQL'):
        load_settings()


def test_vercel_requires_database_and_secure_cookies(monkeypatch):
    configure_vercel(monkeypatch)
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with pytest.raises(RuntimeError, match='DATABASE_URL is required'):
        load_settings()
    monkeypatch.setenv('DATABASE_URL', 'postgresql://beta:pass@db.example/beta')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    with pytest.raises(RuntimeError, match='COOKIE_SECURE'):
        load_settings()


def test_vercel_entrypoint_import_never_connects_or_creates_tables():
    import os
    import subprocess
    import sys
    from pathlib import Path

    env = dict(os.environ, VERCEL='1', APP_ENV='staging', COOKIE_SECURE='true',
               DATABASE_URL='postgresql://beta:pass@db.invalid/beta?sslmode=require',
               DB_SCHEMA='clubhost', SECRET_KEY='test-secret-for-vercel-deployment-configuration')
    code = '''
from unittest.mock import patch
with patch('sqlalchemy.engine.Engine.connect', side_effect=AssertionError('Startup must not connect')):
    import index
    from app.main import engine
    from sqlalchemy.pool import NullPool
    assert index.app.title == 'SportHost'
    assert isinstance(engine.pool, NullPool)
'''
    result = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True,
                            text=True, timeout=30, cwd=Path(__file__).resolve().parents[1])
    assert result.returncode == 0, result.stderr


def test_beta_signup_and_static_assets():
    with TestClient(app) as client:
        page = client.get('/signup')
        assert page.status_code == 200
        assert 'SportHost Beta' in page.text
        assert 'noindex,nofollow' in page.text
        css = client.get('/static/style.css')
        assert css.status_code == 200
        assert 'text/css' in css.headers['content-type']


def test_ready_reports_database_failure_without_exposing_details():
    from app.main import db_session

    class UnavailableDatabase:
        def execute(self, statement):
            raise RuntimeError('private connection details')

    def unavailable():
        yield UnavailableDatabase()

    app.dependency_overrides[db_session] = unavailable
    try:
        with TestClient(app) as client:
            assert client.get('/health').status_code == 200
            response = client.get('/ready')
            assert response.status_code == 503
            assert response.json() == {'detail': 'Database not ready'}
    finally:
        app.dependency_overrides.pop(db_session, None)

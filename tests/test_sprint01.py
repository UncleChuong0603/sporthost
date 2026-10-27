"""Sprint 0/1 regression tests against disposable SQLite only.

PostgreSQL-specific migration integration requires a disposable test Postgres
instance and is intentionally NOT run against an existing production DB.
"""
import re

# Importing sibling tests sets a disposable SQLite DB before app import.
from app.main import app, Base
from fastapi.testclient import TestClient
from app.settings import load_settings


def token(resp):
    return re.search(r'name="csrf" value="([^"]+)"', resp.text).group(1)


def post(client, path, data, from_page):
    return client.post(path, data={**data, 'csrf': token(client.get(from_page))}, follow_redirects=True)


def test_club_and_member_edit_and_ownership():
    with TestClient(app) as alice, TestClient(app) as bob:
        post(alice, '/signup', {'email': 'alice-s1@example.com', 'password': 'test-password-1234'}, '/signup')
        club_result = post(alice, '/clubs', {'name': 'CLB A', 'location': 'Quận 8'}, '/dashboard')
        club_id = int(re.search(r'/clubs/(\d+)', club_result.url.path).group(1))
        post(alice, f'/clubs/{club_id}/members', {'name': 'Member A', 'phone': '0901234567', 'kind': 'fixed', 'level': 'TB'}, f'/clubs/{club_id}')
        member_id = int(re.search(r'/members/(\d+)/edit', alice.get(f'/clubs/{club_id}').text).group(1))
        r = post(alice, f'/clubs/{club_id}/settings', {'name': 'CLB A sau khi sửa', 'location': 'Q8'}, f'/clubs/{club_id}')
        assert 'CLB A sau khi sửa' in r.text
        r = post(alice, f'/clubs/{club_id}/members/{member_id}/edit', {'name': 'Member Updated', 'phone': '0901234568', 'kind': 'guest', 'level': 'TB khá'}, f'/clubs/{club_id}')
        assert 'Member Updated' in r.text and '0901234568' in r.text
        assert 'Vãng lai' in r.text
        post(bob, '/signup', {'email': 'bob-s1@example.com', 'password': 'test-password-1234'}, '/signup')
        assert bob.get(f'/clubs/{club_id}').status_code == 404
        assert bob.post(f'/clubs/{club_id}/settings', data={'csrf': token(bob.get('/dashboard')), 'name': 'Hacked'}).status_code == 404
        assert bob.post(f'/clubs/{club_id}/members/{member_id}/edit', data={'csrf': token(bob.get('/dashboard')), 'name': 'Hacked', 'phone': '0901234568', 'kind': 'guest'}).status_code == 404


def test_readiness_uses_live_db_connection():
    with TestClient(app) as c:
        assert c.get('/health').json() == {'ok': True}
        assert c.get('/ready').json() == {'ok': True}


def test_settings_rejects_production_sqlite_and_public_schema(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///example.db')
    try:
        load_settings()
        assert False, 'production SQLite should fail'
    except RuntimeError as e:
        assert 'PostgreSQL' in str(e)
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://u:p@127.0.0.1:55432/db')
    monkeypatch.setenv('DB_SCHEMA', 'public')
    try:
        load_settings()
        assert False, 'public schema should fail'
    except RuntimeError as e:
        assert 'dedicated' in str(e)
    monkeypatch.setenv('DB_SCHEMA', 'clubhost')
    assert load_settings()['schema'] == 'clubhost'



def test_postgres_migration_ddl_is_schema_qualified_and_non_destructive():
    """Offline SQL smoke test (does not require psycopg or a running server)."""
    import importlib.util
    import io
    from pathlib import Path
    from unittest.mock import patch
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    path = Path(__file__).resolve().parents[1] / 'alembic' / 'versions' / '0001_initial.py'
    with patch('app.settings.load_settings', return_value={'schema': 'clubhost'}):
        spec = importlib.util.spec_from_file_location('clubhost_initial', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    result = io.StringIO()
    context = MigrationContext.configure(dialect_name='postgresql', opts={'as_sql': True, 'output_buffer': result})
    with Operations.context(context):
        module.upgrade()
    sql = result.getvalue().upper()
    assert sql.count('CREATE TABLE CLUBHOST.') == 7
    assert 'REFERENCES CLUBHOST.HOSTS' in sql
    assert 'CREATE TABLE PUBLIC.' not in sql
    assert 'DROP TABLE' not in sql
    assert 'ALTER TABLE PUBLIC.' not in sql
    assert 'TRUNCATE' not in sql

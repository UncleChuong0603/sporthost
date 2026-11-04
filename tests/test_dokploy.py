"""Migration regressions: isolated configuration, providers and durable private media."""
import hashlib
import json
import os
import subprocess
import sys

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import mail, storage
from app.main import app, SETTINGS
from app.settings import load_settings


def production(monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)
    for key, value in {
        'APP_ENV': 'production', 'DATABASE_URL': 'postgresql://test:unused@db.invalid/test',
        'SECRET_KEY': 'isolated-test-secret-at-least-32-characters', 'COOKIE_SECURE': 'true',
        'APP_URL': 'https://sporthost.online',
        'ALLOWED_HOSTS': 'sporthost.online,www.sporthost.online,localhost,127.0.0.1',
    }.items():
        monkeypatch.setenv(key, value)


def test_dokploy_requires_https_cookie_origin_and_explicit_hosts(monkeypatch):
    production(monkeypatch)
    assert load_settings()['serverless'] is False
    assert load_settings()['app_url'] == 'https://sporthost.online'
    monkeypatch.setenv('ALLOWED_HOSTS', '*')
    with pytest.raises(RuntimeError, match='ALLOWED_HOSTS'):
        load_settings()
    production(monkeypatch)
    monkeypatch.setenv('APP_URL', 'http://sporthost.online')
    with pytest.raises(RuntimeError, match='HTTPS'):
        load_settings()
    production(monkeypatch)
    monkeypatch.setenv('APP_URL', 'https://sporthost.online/path')
    with pytest.raises(RuntimeError, match='absolute origin'):
        load_settings()


def test_read_only_preview_blocks_mutations_before_database_access(monkeypatch):
    monkeypatch.setitem(SETTINGS, 'read_only', True)
    from unittest.mock import patch
    from app.main import engine
    with patch.object(engine, 'connect', side_effect=AssertionError('No write request should reach DB')):
        with TestClient(app) as client:
            assert client.get('/health').status_code == 200
            for path in ('/signup', '/login', '/clubs', '/forgot-password'):
                response = client.post(path, data={})
                assert response.status_code == 503
                assert response.json()['detail'].startswith('Read-only deployment')


def test_read_only_preview_uses_postgres_read_only_sessions(monkeypatch):
    production(monkeypatch)
    monkeypatch.setenv('APP_READ_ONLY', 'true')
    result = subprocess.run([sys.executable, '-c', '''
from unittest.mock import patch
import sqlalchemy
original = sqlalchemy.create_engine
captured = {}
def capture(*args, **kwargs):
    captured.update(kwargs)
    return original(*args, **kwargs)
with patch('sqlalchemy.create_engine', side_effect=capture):
    from app.main import SETTINGS
assert SETTINGS['read_only'] is True
assert captured['connect_args']['options'] == '-c default_transaction_read_only=on'
'''], env=dict(os.environ), capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode()


def test_dokploy_import_never_connects_or_migrates(monkeypatch):
    production(monkeypatch)
    result = subprocess.run([sys.executable, '-c', '''
from unittest.mock import patch
with patch('sqlalchemy.engine.Engine.connect', side_effect=AssertionError('no startup DB writes')):
    from app.main import app
    from fastapi.testclient import TestClient
    with TestClient(app, base_url='https://sporthost.online') as client:
        assert client.get('/health').status_code == 200
        assert client.get('/static/style.css').status_code == 200
        assert client.get('/health', headers={'host':'evil.example'}).status_code == 400
        response = client.get('/login', headers={'host':'www.sporthost.online'}, follow_redirects=False)
        assert response.status_code == 308
        assert response.headers['location'] == 'https://sporthost.online/login'
        assert client.get('/forgot-password').status_code == 503
'''], env=dict(os.environ, EMAIL_ENABLED='false'), capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode()


def test_self_hosted_headers_and_disabled_reset(monkeypatch):
    monkeypatch.setitem(SETTINGS, 'env', 'production')
    monkeypatch.setenv('EMAIL_ENABLED', 'false')
    with TestClient(app) as client:
        r = client.get('/health')
        assert r.headers['X-Content-Type-Options'] == 'nosniff'
        assert r.headers['X-Robots-Tag'] == 'noindex, nofollow'
        r = client.get('/forgot-password', headers={'accept':'text/html'})
        assert r.status_code == 503
        assert 'Email khôi phục' in r.text


def test_readiness_rejects_reachable_database_with_old_club_schema():
    from app.main import db_session
    class OldSchema:
        def execute(self, statement):
            if 'clubs' in str(statement):
                raise RuntimeError('private database details: missing fixed_fee column')
    def old_schema():
        yield OldSchema()
    app.dependency_overrides[db_session] = old_schema
    try:
        with TestClient(app) as client:
            assert client.get('/health').status_code == 200
            response = client.get('/ready')
            assert response.status_code == 503
            assert response.json() == {'detail': 'Database not ready'}
    finally:
        app.dependency_overrides.pop(db_session, None)


def test_resend_disabled_or_missing_key_never_claims_delivery(monkeypatch):
    monkeypatch.setenv('EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('EMAIL_FROM', 'SportHost <no-reply@example.test>')
    monkeypatch.setenv('EMAIL_ENABLED', 'false')
    monkeypatch.setenv('RESEND_API_KEY', 'test-only')
    assert not mail.delivery_ready()
    with pytest.raises(HTTPException) as exc:
        mail.send_account_mail('test@example.test', 'test', 'test', environment='production')
    assert exc.value.status_code == 503
    monkeypatch.setenv('EMAIL_ENABLED', 'true')
    monkeypatch.delenv('RESEND_API_KEY')
    assert not mail.delivery_ready()


@pytest.mark.parametrize('statuses,success', [([429, 503, 200], True), ([401], False),
                                           ([500, 500, 500], False), ([200], False)])
def test_resend_retries_are_bounded_and_idempotent(monkeypatch, caplog, statuses, success):
    monkeypatch.setenv('EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('EMAIL_ENABLED', 'true')
    monkeypatch.setenv('EMAIL_FROM', 'sender@example.test')
    monkeypatch.setenv('RESEND_API_KEY', 'secret-that-must-not-be-logged')
    calls = []
    def handle(request):
        calls.append(request)
        status = statuses[len(calls)-1]
        body = {'id':'accepted'} if success and status == 200 else {'message':'private-provider-body'}
        return httpx.Response(status, json=body, headers={'Retry-After':'0'})
    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(mail.httpx, 'Client', lambda **kwargs: client)
    monkeypatch.setattr(mail.time, 'sleep', lambda seconds: None)
    if success:
        assert mail.send_account_mail('private@example.test', 'subject', 'private-token', environment='production') == 'resend-accepted'
    else:
        with pytest.raises(HTTPException) as exc:
            mail.send_account_mail('private@example.test', 'subject', 'private-token', environment='production')
        assert exc.value.status_code == 503
    assert len(calls) == len(statuses)
    assert len({r.headers['Idempotency-Key'] for r in calls}) == 1
    assert all(s not in caplog.text for s in ('private-provider-body','private@example.test','private-token','secret-that-must-not-be-logged'))


def test_private_local_media_survives_separate_process_restart(tmp_path):
    env = dict(os.environ, APP_ENV='production', STORAGE_BACKEND='local', STORAGE_ROOT=str(tmp_path))
    for name in ('VERCEL', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID'):
        env.pop(name, None)
    first = subprocess.run([sys.executable, '-c', '''
import json
from app.storage import put_image
print(json.dumps(put_image(b'isolated-image-bytes', 123, 'proof')))
'''], env=env, capture_output=True, timeout=20)
    assert first.returncode == 0, first.stderr.decode()
    key, digest = json.loads(first.stdout)
    second = subprocess.run([sys.executable, '-c', '''
import hashlib,os
from app.storage import get_image
assert hashlib.sha256(get_image(os.environ['TEST_IMAGE_KEY'])).hexdigest() == os.environ['TEST_IMAGE_HASH']
'''], env=dict(env, TEST_IMAGE_KEY=key, TEST_IMAGE_HASH=digest), capture_output=True, timeout=20)
    assert second.returncode == 0, second.stderr.decode()
    assert hashlib.sha256((tmp_path/key).read_bytes()).hexdigest() == digest
    with TestClient(app) as client:
        assert client.get('/data/uploads/'+key).status_code == 404
        assert client.get('/static/'+key).status_code == 404


def test_production_refuses_implicit_ephemeral_storage(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('STORAGE_BACKEND', 'auto')
    with pytest.raises(HTTPException) as exc:
        storage.put_image(b'test', 1, 'proof')
    assert exc.value.status_code == 503


def test_blob_stays_private_outside_vercel(monkeypatch):
    from vercel.blob import sync as blob
    monkeypatch.delenv('VERCEL', raising=False)
    monkeypatch.setenv('STORAGE_BACKEND', 'blob')
    calls = []
    monkeypatch.setattr(blob, 'put_blob', lambda key, data, **kwargs: calls.append(kwargs))
    storage.put_image(b'private', 1, 'proof')
    assert calls[0]['access'] == 'private'


@pytest.mark.parametrize('failure', ['timeout', 'long-retry-after'])
def test_resend_transport_failure_and_provider_backoff(monkeypatch, failure):
    monkeypatch.setenv('EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('EMAIL_ENABLED', 'true')
    monkeypatch.setenv('EMAIL_FROM', 'sender@example.test')
    monkeypatch.setenv('RESEND_API_KEY', 'test-only')
    calls = []
    def handle(request):
        calls.append(request)
        if failure == 'timeout':
            raise httpx.ReadTimeout('private-error-details', request=request)
        return httpx.Response(429, headers={'Retry-After':'60'})
    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(mail.httpx, 'Client', lambda **kwargs: client)
    monkeypatch.setattr(mail.time, 'sleep', lambda seconds: None)
    with pytest.raises(HTTPException) as exc:
        mail.send_account_mail('test@example.test', 'subject', 'content', environment='production')
    assert exc.value.status_code == 503
    assert len(calls) == (3 if failure == 'timeout' else 1)


@pytest.mark.parametrize('peer,trusted', [('10.1.2.3', True), ('203.0.113.5', False)])
def test_proxy_client_ip_and_scheme_require_trusted_source(peer, trusted):
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
    from starlette.responses import JSONResponse
    async def inspect_scope(scope, receive, send):
        await JSONResponse({'ip': scope['client'][0], 'scheme': scope['scheme']})(scope, receive, send)
    proxied = ProxyHeadersMiddleware(inspect_scope, trusted_hosts='10.1.0.0/16')
    client = TestClient(proxied, client=(peer, 12345))
    r = client.get('/', headers={'x-forwarded-for':'198.51.100.9', 'x-forwarded-proto':'https'})
    assert r.json() == {'ip': '198.51.100.9' if trusted else peer, 'scheme':'https' if trusted else 'http'}
    client.close()

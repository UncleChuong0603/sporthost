"""Always force ephemeral database before loading app/main.py for test collection."""
import os
import tempfile
import pytest

_tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmpdb.close()
os.environ['APP_ENV'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite:///' + _tmpdb.name
os.environ['SECRET_KEY'] = 'test-only-secret-value-for-isolated-local-tests'
os.environ['COOKIE_SECURE'] = 'false'
# Never use connected cloud storage or email credentials during the local suite.
for name in ('VERCEL', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'SMTP_HOST', 'MAIL_FROM',
             'EMAIL_ENABLED', 'EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY',
             'APP_URL', 'PUBLIC_BASE_URL', 'ALLOWED_HOSTS', 'STORAGE_BACKEND', 'STORAGE_ROOT', 'APP_READ_ONLY'):
    os.environ.pop(name, None)


@pytest.fixture(scope='session', autouse=True)
def isolated_uploads(tmp_path_factory):
    from app import storage
    previous = storage.LOCAL_ROOT
    storage.LOCAL_ROOT = tmp_path_factory.mktemp('sporthost-uploads')
    yield
    storage.LOCAL_ROOT = previous


@pytest.fixture(autouse=True)
def isolated_rate_limit_buckets():
    # Every TestClient otherwise shares "testclient" across the whole suite and
    # unrelated account tests exhaust the real per-hour signup bucket.
    # Keep the limiter enabled within each test, including security regressions.
    from sqlalchemy import delete
    from app.main import SessionLocal, engine
    from app.security import RequestLimit
    assert engine.dialect.name == 'sqlite', 'Default suite must use disposable SQLite'
    with SessionLocal.begin() as db:
        db.execute(delete(RequestLimit))


@pytest.fixture(scope='session')
def browser_server():
    import socket
    import threading
    import time
    import uvicorn
    from app.main import app
    sock = socket.socket(); sock.bind(('127.0.0.1', 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level='error', lifespan='off'))
    thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:break
            time.sleep(0.05)
        assert server.started
        yield f'http://127.0.0.1:{sock.getsockname()[1]}'
    finally:
        server.should_exit = True; thread.join(timeout=10); sock.close()

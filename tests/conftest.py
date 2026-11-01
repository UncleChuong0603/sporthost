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
for name in ('VERCEL', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'SMTP_HOST', 'MAIL_FROM'):
    os.environ.pop(name, None)


@pytest.fixture(scope='session', autouse=True)
def isolated_uploads(tmp_path_factory):
    from app import storage
    previous = storage.LOCAL_ROOT
    storage.LOCAL_ROOT = tmp_path_factory.mktemp('sporthost-uploads')
    yield
    storage.LOCAL_ROOT = previous

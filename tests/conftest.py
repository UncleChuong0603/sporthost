"""Always force ephemeral database before loading app/main.py for test collection."""
import os
import tempfile

_tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmpdb.close()
os.environ['APP_ENV'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite:///' + _tmpdb.name
os.environ['SECRET_KEY'] = 'test-only-secret-value-for-isolated-local-tests'
os.environ['COOKIE_SECURE'] = 'false'

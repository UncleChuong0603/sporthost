"""Configuration shared by app and migration tooling.

PostgreSQL is required for staging/production. SQLite is explicitly restricted to
local demos/tests. Never put a remote database password or SSH key in source.
"""
import os
import re
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url
from dotenv import load_dotenv

load_dotenv()


def load_settings():
    hosted = os.getenv('VERCEL') == '1'
    env = os.getenv('APP_ENV', 'production' if hosted else 'development').strip().lower()
    if env not in ('development', 'test', 'staging', 'production'):
        raise RuntimeError('APP_ENV must be development, test, staging, or production')
    url = os.getenv('DATABASE_URL', '' if hosted else 'sqlite:///./sporthost.db').strip()
    if not url:
        raise RuntimeError('DATABASE_URL is required; configure persistent PostgreSQL')
    # Marketplace providers supply standard URLs; consistently select psycopg 3.
    if url.startswith(('postgres://', 'postgresql://')):
        url = 'postgresql+psycopg://' + url.split('://', 1)[1]
    driver = make_url(url).get_backend_name()
    if driver not in ('sqlite', 'postgresql'):
        raise RuntimeError('Supported DATABASE_URL backends: PostgreSQL or dev/test SQLite')
    if (hosted or env in ('staging', 'production')) and driver != 'postgresql':
        raise RuntimeError('Staging/production must use PostgreSQL, not SQLite')
    if driver == 'postgresql':
        schema = os.getenv('DB_SCHEMA', 'clubhost').strip()
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', schema) or schema in ('public', 'pg_catalog', 'information_schema') or schema.startswith('pg_'):
            raise RuntimeError('DB_SCHEMA must be a dedicated safe identifier, not public or a system schema')
        # Dialect-qualified URL lets every deployment use the same psycopg driver.
        if make_url(url).drivername != 'postgresql+psycopg':
            raise RuntimeError('PostgreSQL URL must start with postgresql+psycopg://')
    else:
        schema = None
    secret = os.getenv('SECRET_KEY', 'dev-only-secret-change-before-deploy')
    secure_cookie = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
    if hosted or env in ('staging', 'production'):
        if len(secret) < 32 or secret == 'dev-only-secret-change-before-deploy' or secret == 'replace-with-at-least-32-random-characters':
            raise RuntimeError('Set a strong SECRET_KEY (32+ random characters)')
        if not secure_cookie:
            raise RuntimeError('COOKIE_SECURE must be true on staging/production (HTTPS required)')
    app_url = os.getenv('APP_URL', os.getenv('PUBLIC_BASE_URL', 'https://sporthost.vercel.app' if hosted else 'http://127.0.0.1:8000')).rstrip('/')
    parsed = urlsplit(app_url)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path):
        raise RuntimeError('APP_URL/PUBLIC_BASE_URL must be an absolute origin without credentials, path, query or fragment')
    if env in ('staging', 'production') and parsed.scheme != 'https':
        raise RuntimeError('APP_URL/PUBLIC_BASE_URL must use HTTPS on staging/production')
    allowed_hosts = [host.strip() for host in os.getenv('ALLOWED_HOSTS', '').split(',') if host.strip()]
    read_only = os.getenv('APP_READ_ONLY', 'false').strip().lower()
    if read_only not in ('true', 'false'):
        raise RuntimeError('APP_READ_ONLY must be true or false')
    if env in ('staging', 'production') and not hosted:
        if not allowed_hosts or '*' in allowed_hosts:
            raise RuntimeError('ALLOWED_HOSTS must explicitly list the Dokploy domains and localhost')
        if parsed.hostname not in allowed_hosts:
            raise RuntimeError('ALLOWED_HOSTS must include the APP_URL hostname')
    return {'env': env, 'url': url, 'driver': driver, 'schema': schema, 'secret': secret,
            'cookie_secure': secure_cookie, 'serverless': hosted, 'app_url': app_url,
            'allowed_hosts': allowed_hosts, 'read_only': read_only == 'true'}

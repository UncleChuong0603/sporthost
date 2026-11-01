"""Opt-in real PostgreSQL migrations. NEVER falls back to DATABASE_URL.

Only loopback/tunneled databases explicitly named *_test or *_staging are allowed.
Creates and removes only random sporthost_test_* schemas owned by this test run.
"""
import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def test_club_settings_postgres_upgrade_preserves_legacy_data_and_other_schema():
    raw_url = os.getenv('SPORTHOST_TEST_POSTGRES_URL')
    if not raw_url:
        pytest.skip('SPORTHOST_TEST_POSTGRES_URL is not configured; no PostgreSQL connection attempted')
    if os.getenv('SPORTHOST_ALLOW_POSTGRES_TESTS') != '1':
        pytest.fail('Set SPORTHOST_ALLOW_POSTGRES_TESTS=1 only for an approved disposable PostgreSQL database')
    url = make_url(raw_url)
    if url.get_backend_name() != 'postgresql' or url.host not in ('127.0.0.1', 'localhost', '::1'):
        pytest.fail('PostgreSQL integration requires an explicit loopback/SSH tunnel test URL')
    if not (url.database or '').endswith(('_test', '_staging')):
        pytest.fail('PostgreSQL test database name must end in _test or _staging; production targets are refused')
    url = url.set(drivername='postgresql+psycopg')
    schema = 'sporthost_test_' + secrets.token_hex(8)
    sentinel_schema = schema + '_other'
    engine = create_engine(url, connect_args={'connect_timeout': 5})
    root = Path(__file__).resolve().parents[1]
    env = dict(os.environ, APP_ENV='test', DATABASE_URL=url.render_as_string(hide_password=False), DB_SCHEMA=schema)
    env.pop('VERCEL', None)
    created = []

    def migrate(target):
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', target], cwd=root,
                                env=env, capture_output=True, timeout=60)
        assert result.returncode == 0, 'Migration failed on the disposable PostgreSQL target; inspect locally without publishing credentials'

    try:
        for name in (schema, sentinel_schema):
            with engine.begin() as con:
                con.execute(text(f'CREATE SCHEMA "{name}"'))
            created.append(name)
        with engine.begin() as con:
            con.execute(text(f'CREATE TABLE "{sentinel_schema}".sentinel (id integer PRIMARY KEY, value text NOT NULL)'))
            con.execute(text(f"INSERT INTO \"{sentinel_schema}\".sentinel VALUES (1, 'unchanged')"))
        migrate('0004_full_roadmap')
        with engine.begin() as con:
            con.execute(text(f"INSERT INTO \"{schema}\".hosts (id,email,password_hash) VALUES (1,'legacy@example.com','test-only')"))
            con.execute(text(f"INSERT INTO \"{schema}\".clubs (id,owner_id,name,location) VALUES (1,1,'Legacy badminton','Q8')"))
            con.execute(text(f"INSERT INTO \"{schema}\".members (id,club_id,name,phone,kind,level) VALUES (1,1,'Legacy guest','0901234567','guest','TB')"))
            con.execute(text(f"INSERT INTO \"{schema}\".game_sessions (id,club_id,public_id,title,venue,starts_at,capacity,fixed_fee,guest_fee,is_open) VALUES (1,1,'legacy-public','Legacy session','Q8','2027-01-08T19:00',15,0,70000,true)"))
            con.execute(text(f"INSERT INTO \"{schema}\".bookings (id,session_id,member_id,status,paid,attended,fee_amount,payment_status) VALUES (1,1,1,'confirmed',true,true,70000,'confirmed')"))
            con.execute(text(f"INSERT INTO \"{schema}\".monthly_dues (id,member_id,period,amount,paid) VALUES (1,1,'2027-01',300000,false)"))
            con.execute(text(f"INSERT INTO \"{schema}\".expenses (id,session_id,title,amount) VALUES (1,1,'Court',50000)"))
            legacy = {table: list(con.execute(text(f'SELECT * FROM "{schema}".{table}')).mappings())
                      for table in ('hosts', 'members', 'game_sessions', 'bookings', 'monthly_dues', 'expenses')}
        migrate('head')
        migrate('head')  # Already-applied migration must be idempotent through Alembic.
        with engine.connect() as con:
            club = con.execute(text(f'SELECT * FROM "{schema}".clubs WHERE id=1')).mappings().one()
            assert club['sport_type'] == 'badminton' and club['default_capacity'] == 20
            assert club['default_approval_mode'] == 'MANUAL_APPROVE' and club['default_fee_mode'] == 'FIXED_PRICE'
            assert club['name'] == 'Legacy badminton' and club['location'] == 'Q8'
            for table, rows in legacy.items():
                assert list(con.execute(text(f'SELECT * FROM "{schema}".{table}')).mappings()) == rows
            assert con.scalar(text(f'SELECT value FROM "{sentinel_schema}".sentinel WHERE id=1')) == 'unchanged'
            assert con.scalar(text(f'SELECT version_num FROM "{schema}".alembic_version')) == '0005_club_settings'
    finally:
        # Names are generated here, not user input; only schemas actually created
        # successfully by this invocation may be removed.
        for name in reversed(created):
            assert name.startswith('sporthost_test_') and re_safe_schema(name)
            with engine.begin() as con:
                con.execute(text(f'DROP SCHEMA "{name}" CASCADE'))
        engine.dispose()


def re_safe_schema(name):
    import re
    return bool(re.fullmatch(r'sporthost_test_[0-9a-f]{16}(?:_other)?', name))

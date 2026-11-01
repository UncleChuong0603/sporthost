"""Apply only the migration chain just verified against a restored schema.

Usage: python -m scripts.apply_verified_release --env-file PRIVATE_ENV --apply
Requires explicit release authorization and scripts.verify_release to have passed.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit('No changes made; --apply is required after explicit release authorization')
    report = json.loads(Path('.vercel/release-checks/latest.json').read_text(encoding='utf-8'))
    assert report['restore_verified'] and report['migration_preserved_existing_columns']
    assert hashlib.sha256(Path(report['backup_file']).read_bytes()).hexdigest() == report['backup_sha256']
    chain_hash = hashlib.sha256(b''.join(path.read_bytes() for path in sorted(Path('alembic/versions').glob('*.py')))).hexdigest()
    assert chain_hash == report['migration_sha256'], 'Migrations changed after restore validation; verify again'
    head = ScriptDirectory.from_config(Config('alembic.ini')).get_current_head()
    assert head == report['verified_revision']
    values = dotenv_values(args.env_file)
    url = make_url(values.get('DATABASE_URL_UNPOOLED') or values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    target_hash = hashlib.sha256(f'{url.host}|{url.port}|{url.database}|clubhost'.encode()).hexdigest()
    assert target_hash == report['target_sha256'], 'Target differs from verified backup source'
    engine = create_engine(url, connect_args={'connect_timeout': 15})
    try:
        with engine.connect() as con:
            assert con.scalar(text('SELECT version_num FROM clubhost.alembic_version')) == report['source_revision']
        env = dict(os.environ, APP_ENV='test', DB_SCHEMA='clubhost', DATABASE_URL=url.render_as_string(hide_password=False),
                   SECRET_KEY='operator-migration-process-only-secret', COOKIE_SECURE='false',
                   PGOPTIONS='-c lock_timeout=5s -c statement_timeout=60000')
        env.pop('VERCEL', None)
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', head], env=env, capture_output=True, timeout=120)
        if result.returncode:
            artifact = Path('.vercel/release-checks/migration-error.log')
            artifact.write_bytes(result.stdout + result.stderr)
            raise RuntimeError('Migration failed; inspect private release artifact')
        with engine.connect() as con:
            assert con.scalar(text('SELECT version_num FROM clubhost.alembic_version')) == head
        print('Authorized, backup-verified migration complete:', head)
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()

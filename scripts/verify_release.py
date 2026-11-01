"""Private operator check: snapshot and verify SportHost schema before release.

Reads existing local Vercel configuration without logging credentials or records.
Only generated sporthost_release_check_* schemas are created for restore validation.
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import MetaData, create_engine, select, text


def main():
    values = dotenv_values('.vercel/action-plan-production.env')
    raw = values.get('DATABASE_URL_UNPOOLED') or values.get('DATABASE_URL')
    if not raw or '[SENSITIVE]' in raw:
        raise SystemExit('A usable existing database URL is required in the private environment file')
    from sqlalchemy.engine import make_url
    url = make_url(raw).set(drivername='postgresql+psycopg')
    engine = create_engine(url, connect_args={'connect_timeout': 15})
    schema = 'clubhost'
    clone = 'sporthost_release_check_' + secrets.token_hex(8)
    metadata = MetaData()
    artifact_dir = Path('.vercel/release-checks')
    artifact_dir.mkdir(parents=True, exist_ok=True)
    created = False
    try:
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as con, con.begin():
            con.execute(text('SET TRANSACTION READ ONLY'))
            metadata.reflect(bind=con, schema=schema)
            if f'{schema}.alembic_version' not in metadata.tables:
                raise RuntimeError('Expected existing SportHost migration history is missing')
            rows = {table.name: [dict(row) for row in con.execute(select(table)).mappings()]
                    for table in metadata.sorted_tables}
        version = rows['alembic_version'][0]['version_num']
        print('Existing SportHost revision:', version)
        print('SportHost table/club counts:', len(rows), len(rows.get('clubs', [])))
        # Only schema-local tables and rows are backed up; no queries against other app tables.
        payload = json.dumps({'schema': schema, 'revision': version, 'tables': rows},
                             ensure_ascii=False, sort_keys=True, default=str).encode('utf-8')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        backup = artifact_dir / f'pre-release-{stamp}.json'
        with backup.open('xb') as output:
            output.write(payload)
        assert json.loads(backup.read_text(encoding='utf-8'))['revision'] == version
        print('Private database snapshot saved; SHA-256:', hashlib.sha256(payload).hexdigest())
        with engine.begin() as con:
            con.execute(text(f'CREATE SCHEMA "{clone}"'))
        created = True
        clone_meta = MetaData()
        for table in metadata.sorted_tables:
            table.to_metadata(clone_meta, schema=clone)
        with engine.begin() as con:
            clone_meta.create_all(con)
            for source in metadata.sorted_tables:
                if rows[source.name]:
                    con.execute(clone_meta.tables[f'{clone}.{source.name}'].insert(), rows[source.name])
            for table in clone_meta.sorted_tables:
                restored = [dict(row) for row in con.execute(select(table)).mappings()]
                sort_rows = lambda data: sorted(json.dumps(row, sort_keys=True, default=str) for row in data)
                assert sort_rows(restored) == sort_rows(rows[table.name])
        print('Restore validation passed in a generated SportHost-only schema')
        env = dict(os.environ, APP_ENV='test', DATABASE_URL=url.render_as_string(hide_password=False),
                   DB_SCHEMA=clone, SECRET_KEY='release-check-disposable-test-secret', COOKIE_SECURE='false')
        env.pop('VERCEL', None)
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'],
                                env=env, capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError('Cloned-schema migration failed; inspect privately before release')
        with engine.connect() as con:
            for source in metadata.sorted_tables:
                columns = ','.join('"'+column.name+'"' for column in source.columns)
                after = [dict(row) for row in con.execute(text(f'SELECT {columns} FROM "{clone}"."{source.name}"')).mappings()]
                if source.name != 'alembic_version':
                    assert sort_rows(after) == sort_rows(rows[source.name]), source.name
            head = con.scalar(text(f'SELECT version_num FROM "{clone}".alembic_version'))
        report = {'source_revision': version, 'verified_revision': head, 'tables': len(rows),
                  'backup_file': str(backup), 'backup_sha256': hashlib.sha256(payload).hexdigest(),
                  'restore_verified': True, 'migration_preserved_existing_columns': True}
        report['migration_sha256'] = hashlib.sha256(b''.join(path.read_bytes() for path in sorted(Path('alembic/versions').glob('*.py')))).hexdigest()
        report['target_sha256'] = hashlib.sha256(f'{url.host}|{url.port}|{url.database}|{schema}'.encode()).hexdigest()
        (artifact_dir / 'latest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print('Cloned-schema migration verified:', head, '; legacy records unchanged')
    finally:
        if created:
            import re
            assert re.fullmatch(r'sporthost_release_check_[0-9a-f]{16}', clone)
            with engine.begin() as con:
                con.execute(text(f'DROP SCHEMA "{clone}" CASCADE'))
        engine.dispose()


if __name__ == '__main__':
    main()

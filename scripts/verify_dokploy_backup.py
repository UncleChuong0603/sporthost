"""Next.js backup restore and regression drill in a temporary LOCAL PostgreSQL process only.

Never reads source DB credentials. No production URL or target URL is accepted.
The cluster and reports remain private under .vercel; no OS service is installed.
"""
import argparse
import hashlib
import json
import os
import secrets
import socket
import subprocess
import time
import zipfile
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from scripts.backup_dokploy_source import rows_hash


def run(argv, env, root, label, **kwargs):
    result = subprocess.run(argv, env=env, capture_output=True, timeout=120, **kwargs)
    if result.returncode:
        (root/(label+'.private.log')).write_bytes(result.stdout+result.stderr)
        raise RuntimeError(label+' failed; inspect the private log')
    return result.stdout


def verify(args):
    workspace = Path.cwd().resolve()
    private = workspace/'.vercel'
    backup = Path(args.backup_dir).resolve()
    root = Path(args.work_dir).resolve()
    if not backup.is_relative_to(private) or not root.is_relative_to(private):
        raise ValueError('All verification artifacts must stay below gitignored .vercel')
    manifest = json.loads((backup/'manifest.private.json').read_text(encoding='utf-8'))
    schema = manifest['schema']
    import re
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', schema) or schema in ('public', 'information_schema') or schema.startswith('pg_'):
        raise ValueError('Unsafe backup schema')
    archive = backup/'sporthost-schema.dump'
    if hashlib.file_digest(archive.open('rb'),'sha256').hexdigest() != manifest['dump_sha256']:
        raise ValueError('Native backup hash mismatch')
    if not manifest['media_verified']:
        raise ValueError('Media backup is incomplete')
    with zipfile.ZipFile(backup/'sporthost-media.zip') as media:
        if media.testzip():raise ValueError('Media archive integrity failure')
        for item in manifest['media'].values():
            if hashlib.sha256(media.read(item['file'])).hexdigest() != item['sha256']:
                raise ValueError('Media hash mismatch')
    root.mkdir(parents=True, exist_ok=False)
    pg_bin = Path(args.pg_bin).resolve()
    suffix = '.exe' if os.name == 'nt' else ''
    binary = lambda name: str(pg_bin/(name+suffix))
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    password = secrets.token_urlsafe(32)
    pwfile = root/'local-password.private.txt'
    pwfile.write_text(password, encoding='utf-8')
    data = root/'cluster'
    run([binary('initdb'), '-D', str(data), '-U', 'sporthost_verify', '--pwfile='+str(pwfile),
         '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-instructions'], env, root, 'initdb')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port = sock.getsockname()[1]
    env.update(PGHOST='127.0.0.1', PGPORT=str(port), PGDATABASE='postgres',
               PGUSER='sporthost_verify', PGPASSWORD=password, PGCONNECT_TIMEOUT='3', PGSSLMODE='disable')
    log = (root/'postgres.private.log').open('wb')
    process = subprocess.Popen([binary('postgres'), '-D', str(data), '-h', '127.0.0.1', '-p', str(port)],
                               env=env, stdout=log, stderr=log,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    url = URL.create('postgresql+psycopg', username='sporthost_verify', password=password,
                     host='127.0.0.1', port=port, database='postgres')
    assert url.host == '127.0.0.1' and url.port == port
    engine = create_engine(url, connect_args={'connect_timeout':2})
    target = None
    try:
        for attempt in range(100):
            if process.poll() is not None:
                raise RuntimeError('Local verification server exited')
            try:
                with engine.connect() as con:con.execute(text('SELECT 1'))
                break
            except Exception:time.sleep(0.1)
        else:raise RuntimeError('Local verification server did not become ready')
        with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as con:
            con.execute(text('CREATE DATABASE sporthost_restore_check_test'))
        env['PGDATABASE'] = 'sporthost_restore_check_test'
        run([binary('pg_restore'), '--no-password', '--exit-on-error', '--no-owner', '--no-acl',
             '--dbname=sporthost_restore_check_test', str(archive)], env, root, 'restore')
        target_url = url.set(database='sporthost_restore_check_test')
        target = create_engine(target_url)
        def compare_original_columns():
            with target.connect() as con:
                for table, expected in manifest['tables'].items():
                    if not re.fullmatch(r'[a-z][a-z0-9_]*',table):raise ValueError('Unsafe table name')
                    if not all(re.fullmatch(r'[a-z][a-z0-9_]*',column) for column in expected['columns']):
                        raise ValueError('Unsafe column name')
                    columns = ','.join('"'+c+'"' for c in expected['columns'])
                    rows = con.execute(text(f'SELECT {columns} FROM "{schema}"."{table}"')).mappings().all()
                    if len(rows) != expected['count'] or rows_hash(rows) != expected['sha256']:
                        raise RuntimeError('Restored legacy record verification failed')
        compare_original_columns()
        with target.connect() as con:
            restored_revision = con.scalar(text(f'SELECT version_num FROM "{schema}".alembic_version'))
        if restored_revision != manifest['revision']:raise RuntimeError('Restored revision mismatch')
        # Apply only the reviewed additive table on this disposable restored copy.
        with target.connect().execution_options(isolation_level='AUTOCOMMIT') as con:
            con.exec_driver_sql((workspace/'v2/migrations/0001_member_accounts.sql').read_text(encoding='utf8'))
        compare_original_columns()
        expired_pruned = 0
        if args.run_tests:
            from sqlalchemy import MetaData, select
            from time import time as unix_time
            with target.connect() as con:
                metadata = MetaData(); metadata.reflect(bind=con, schema=schema, resolve_fks=False)
                counters = {row['id']:dict(row) for row in con.execute(select(metadata.tables[schema+'.request_limits'])).mappings()}
                business_before = {name:rows_hash(con.execute(select(table)).mappings().all()) for name,table in metadata.tables.items() if table.name != 'request_limits'}
            test_env = dict(os.environ, SPORTHOST_TEST_DATABASE_URL=target_url.set(drivername='postgresql').render_as_string(hide_password=False))
            run(['npm.cmd' if os.name=='nt' else 'npm','test'], test_env, root, 'nextjs-regression', cwd=workspace/'v2')
            with target.connect() as con:
                for name,expected in business_before.items():
                    if rows_hash(con.execute(select(metadata.tables[name])).mappings().all()) != expected:
                        raise RuntimeError('Next.js tests changed restored original business rows')
                remaining = {row['id']:dict(row) for row in con.execute(select(metadata.tables[schema+'.request_limits'])).mappings()}
                if any(key not in counters or counters[key] != row for key,row in remaining.items()):
                    raise RuntimeError('Operational test counters leaked into the restored copy')
                removed = counters.keys()-remaining.keys()
                if any(counters[key]['bucket'] >= int(unix_time()) for key in removed):
                    raise RuntimeError('An active original rate counter was removed')
                expired_pruned = len(removed)
        summary = {'restored_revision':restored_revision, 'verified_revision':restored_revision,
                   'tables':len(manifest['tables']), 'restore_rows_verified':True,
                   'additive_member_schema_verified':True, 'legacy_business_rows_preserved':True,
                   'media_archive_verified':True, 'media_files':len(manifest['media']),
                   'nextjs_regression_passed':bool(args.run_tests), 'expired_operational_counters_pruned':expired_pruned,
                   'production_database_modified':False}
        (root/'verification.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
        print(json.dumps(summary,indent=2))
    finally:
        if target is not None:target.dispose()
        engine.dispose()
        if process.poll() is None:
            stopped=subprocess.run([binary('pg_ctl'),'-D',str(data),'stop','-m','fast','-w'],
                                   env=env,capture_output=True,timeout=30)
            if stopped.returncode:
                process.terminate()
            process.wait(timeout=15)
        log.close()
        print('Temporary local PostgreSQL process stopped; private verification artifacts retained')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir',required=True)
    parser.add_argument('--pg-bin',required=True)
    parser.add_argument('--work-dir',required=True)
    parser.add_argument('--run-tests',action='store_true',help='Run the Node/Vitest suite on the disposable restored copy')
    args=parser.parse_args()
    try:verify(args)
    except Exception as exc:
        raise SystemExit('Local-only restore/migration verification failed ('+type(exc).__name__+'); inspect private artifacts') from None


if __name__=='__main__':main()

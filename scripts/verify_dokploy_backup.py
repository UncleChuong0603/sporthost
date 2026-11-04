"""Restore and migration drill in a temporary LOCAL PostgreSQL process only.

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
import sys
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
            con.execute(text('CREATE DATABASE sporthost_restore_check'))
        env['PGDATABASE'] = 'sporthost_restore_check'
        run([binary('pg_restore'), '--no-password', '--exit-on-error', '--no-owner', '--no-acl',
             '--dbname=sporthost_restore_check', str(archive)], env, root, 'restore')
        target_url = url.set(database='sporthost_restore_check')
        target = create_engine(target_url)
        def compare_original_columns():
            with target.connect() as con:
                for table, expected in manifest['tables'].items():
                    if table == 'alembic_version':continue
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
        app_env = dict(env, APP_ENV='test', DATABASE_URL=target_url.render_as_string(hide_password=False),
                       DB_SCHEMA=schema, SECRET_KEY='local-restore-only-not-a-production-key', COOKIE_SECURE='false',
                       APP_URL='http://127.0.0.1:8000', PUBLIC_BASE_URL='http://127.0.0.1:8000',
                       EMAIL_ENABLED='false', APP_READ_ONLY='false')
        for key in ('VERCEL','DATABASE_MIGRATION_URL','BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID',
                    'RESEND_API_KEY','SMTP_HOST','MAIL_FROM','ALLOWED_HOSTS'):
            app_env.pop(key, None)
        run([sys.executable,'-m','alembic','upgrade','head'], app_env, root, 'migration', cwd=workspace)
        compare_original_columns()
        with target.connect() as con:
            new_revision = con.scalar(text(f'SELECT version_num FROM "{schema}".alembic_version'))
            new_columns = con.execute(text('SELECT column_name FROM information_schema.columns WHERE table_schema=:s AND table_name=\'clubs\''),{'s':schema}).scalars().all()
        assert new_revision == '0011_fixed_member_fees'
        assert all(c in new_columns for c in ('fixed_fee','fixed_fee_male','fixed_fee_female'))
        # Only read against the restored data, with DB-enforced read-only sessions.
        app_env['DATABASE_URL'] = target_url.update_query_dict({'options':'-c default_transaction_read_only=on'}).render_as_string(hide_password=False)
        app_env['APP_READ_ONLY'] = 'true'
        probe = '''from app.main import app,SessionLocal,Club
from sqlalchemy import select
from fastapi.testclient import TestClient
with TestClient(app) as c:
 assert c.get('/health').status_code==200
 assert c.get('/ready').status_code==200
 assert c.get('/login').status_code==200
with SessionLocal() as db:
 db.execute(select(Club).limit(1))
'''
        run([sys.executable,'-c',probe], app_env, root, 'current-runtime-read', cwd=workspace)
        # Historical source is evidence for that release only, not proof of live Vercel SHA.
        old = root/'documented-vercel-source'
        old.mkdir()
        release = args.vercel_commit
        if not re.fullmatch(r'[0-9a-f]{7,40}', release):
            raise ValueError('Use the reviewed historical commit SHA')
        payload = run(['git','archive','--format=zip',release,'app','public'], env, root, 'git-archive', cwd=workspace)
        import io
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            for item in z.infolist():
                dest=(old/item.filename).resolve()
                if not dest.is_relative_to(old):raise ValueError('Unsafe source archive')
                if not item.is_dir():
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    dest.write_bytes(z.read(item))
        run([sys.executable,'-c',probe], app_env, root, 'documented-vercel-runtime-read', cwd=old)
        summary = {'restored_revision':restored_revision, 'verified_revision':new_revision,
                   'tables':len(manifest['tables']), 'restore_rows_verified':True,
                   'migration_preserved_all_legacy_columns':True,
                   'media_archive_verified':True, 'media_files':len(manifest['media']),
                   'documented_vercel_commit_read_compatible':release,
                   'current_container_code_read_probe':True, 'live_vercel_commit_verified':False,
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
    parser.add_argument('--vercel-commit',default='8ee0239',help='Latest Vercel source recorded in the Sprint 6 report; not proof of current live SHA')
    args=parser.parse_args()
    try:verify(args)
    except Exception as exc:
        raise SystemExit('Local-only restore/migration verification failed ('+type(exc).__name__+'); inspect private artifacts') from None


if __name__=='__main__':main()

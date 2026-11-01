"""Verify PostgreSQL + private image backup into two generated test schemas.

python -m scripts.check_backup_restore --env-file PRIVATE_ENV
Only the existing connection is reused; source and restore data are synthetic and isolated.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import zipfile

from dotenv import dotenv_values
from sqlalchemy import create_engine,text
from sqlalchemy.engine import make_url


def fixture():
    import io
    from PIL import Image
    from app.main import SessionLocal,Host,Club,StoredAsset,AuditLog
    from app.storage import put_image
    with SessionLocal.begin() as db:
        host=Host(email='backup-fixture@example.com',password_hash='test-only');db.add(host);db.flush()
        club=Club(owner_id=host.id,name='Isolated backup fixture');db.add(club);db.flush()
        output=io.BytesIO();Image.new('RGB',(10,10),'green').save(output,format='PNG')
        data=output.getvalue();key,digest=put_image(data,club.id,'qr')
        db.add(StoredAsset(club_id=club.id,key=key,kind='qr',sha256=digest,size=len(data)))
        club.qr_key=key
        db.add(AuditLog(club_id=club.id,host_id=host.id,action='Fixture backup',details='Synthetic only'))


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--env-file')
    parser.add_argument('--fixture',action='store_true',help=argparse.SUPPRESS);args=parser.parse_args()
    if args.fixture:fixture();return
    if not args.env_file:parser.error('--env-file is required')
    values=dotenv_values(args.env_file);raw=values.get('DATABASE_URL_UNPOOLED') or values.get('DATABASE_URL')
    if not raw or '[SENSITIVE]' in raw:raise SystemExit('Usable private PostgreSQL configuration required')
    url=make_url(raw).set(drivername='postgresql+psycopg')
    source='sporthost_backup_check_'+secrets.token_hex(8);target='sporthost_backup_check_'+secrets.token_hex(8)
    engine=create_engine(url,connect_args={'connect_timeout':15});created=[]
    root=Path('.vercel/test-artifacts').resolve();root.mkdir(parents=True,exist_ok=True)
    assert root.is_relative_to(Path.cwd().resolve())
    env=dict(os.environ,APP_ENV='test',DB_SCHEMA=source,DATABASE_URL=url.render_as_string(hide_password=False),
             SECRET_KEY='backup-restore-isolated-test-secret',COOKIE_SECURE='false')
    for name in ('VERCEL','DATABASE_MIGRATION_URL','BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','SMTP_HOST','MAIL_FROM'):
        env.pop(name,None)
    def run(arguments,variables):
        result=subprocess.run([sys.executable,'-m',*arguments],env=variables,capture_output=True,timeout=120)
        if result.returncode:
            (root/'backup-check-error.log').write_bytes(result.stdout+result.stderr)
            raise RuntimeError('Backup verification failed; inspect private test artifact')
    try:
        for schema in (source,target):
            with engine.begin() as con:con.execute(text(f'CREATE SCHEMA "{schema}"'))
            created.append(schema)
        with tempfile.TemporaryDirectory(prefix='backup-check-',dir=root) as temporary:
            temp=Path(temporary).resolve();assert temp.is_relative_to(root)
            env['SPORTHOST_LOCAL_UPLOAD_DIR']=str(temp/'source-media')
            run(['alembic','upgrade','head'],env)
            run(['scripts.check_backup_restore','--fixture'],env)
            archive_path=temp/'private-backup.zip'
            run(['scripts.backup','export','--file',str(archive_path)],env)
            restore_env={**env,'SPORTHOST_LOCAL_UPLOAD_DIR':str(temp/'restored-media')}
            run(['scripts.backup','restore','--file',str(archive_path),'--schema',target],restore_env)
            with zipfile.ZipFile(archive_path) as archive:
                manifest=json.loads(archive.read('manifest.json'))
            with engine.connect() as con:
                for table,original in manifest['tables'].items():
                    restored=[dict(row) for row in con.execute(text(f'SELECT * FROM "{target}"."{table}"')).mappings()]
                    expected=[dict(row,session_version=row['session_version']+1) for row in original] if table=='hosts' else original
                    sort=lambda rows:sorted(json.dumps(row,sort_keys=True,default=str) for row in rows)
                    assert sort(expected)==sort(restored),table
                # Serial sequences must be advanced after inserting restored IDs.
                existing=max(row['id'] for row in manifest['tables']['hosts'])
                with con.begin_nested():
                    new=con.scalar(text(f'INSERT INTO "{target}".hosts (email,password_hash) VALUES (\'sequence@example.com\',\'test\') RETURNING id'))
                    assert new>existing
            for key,entry in manifest['media'].items():
                restored=(temp/'restored-media'/key).resolve();assert restored.is_relative_to(temp)
                assert hashlib.sha256(restored.read_bytes()).hexdigest()==entry['sha256']
                assert restored!=(temp/'source-media'/key).resolve()
            assert len(manifest['media'])==1
            print(f'PostgreSQL backup/restore passed: {len(manifest["tables"])} tables, private image hash, independent media destination, invalidated sessions and serial sequences')
    finally:
        for schema in reversed(created):
            assert re.fullmatch(r'sporthost_backup_check_[0-9a-f]{16}',schema)
            with engine.begin() as con:con.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


if __name__=='__main__':main()

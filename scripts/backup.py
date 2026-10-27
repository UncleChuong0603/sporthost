"""Backup/restore a dedicated SportHost schema and private media.

python -m scripts.backup export --file .vercel/backup.zip
python -m scripts.backup restore --file .vercel/backup.zip --schema clubhost_restore_check
Restore only accepts a different, empty dedicated schema. It never overwrites a live schema.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

from sqlalchemy import create_engine,select,text,Integer
from app.settings import load_settings


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['export','restore']);parser.add_argument('--file',required=True)
    parser.add_argument('--schema');parser.add_argument('--skip-media',action='store_true')
    args=parser.parse_args();settings=load_settings()
    if settings['driver']!='postgresql':raise SystemExit('Backups require PostgreSQL')
    from app.main import Base
    from app.storage import get_image,put_image,use_blob,local_path
    engine=create_engine(settings['url'],connect_args={'connect_timeout':15})
    path=Path(args.file)
    if args.action=='export':
        if path.exists():raise SystemExit('Refusing to overwrite an existing backup')
        path.parent.mkdir(parents=True,exist_ok=True)
        manifest={'schema':settings['schema'],'version':1,'tables':{},'media':{}}
        media={}
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as con,con.begin():
            con.execute(text('SET TRANSACTION READ ONLY'))
            for table in Base.metadata.sorted_tables:
                manifest['tables'][table.name]=[dict(r) for r in con.execute(select(table)).mappings()]
        if not args.skip_media:
            for asset in manifest['tables'].get('stored_assets',[]):
                if asset['size']==0:continue
                data=get_image(asset['key'])
                digest=hashlib.sha256(data).hexdigest()
                if digest!=asset['sha256']:raise RuntimeError('Stored media hash mismatch')
                manifest['media'][asset['key']]={'sha256':digest,'file':'media/'+str(asset['id'])+'.png'}
                media['media/'+str(asset['id'])+'.png']=data
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,default=str))
            for name,data in media.items():archive.writestr(name,data)
        with zipfile.ZipFile(path) as archive:
            if archive.testzip():raise RuntimeError('Backup verification failed')
            assert json.loads(archive.read('manifest.json'))==manifest
        print(f'Backup verified: {len(manifest["tables"])} tables, {len(media)} media files. Keep this file private.')
    else:
        if not args.schema or args.schema==settings['schema']:raise SystemExit('Restore requires a different empty --schema')
        os.environ['DB_SCHEMA']=args.schema;target=load_settings()['schema']
        with zipfile.ZipFile(path) as archive:
            if archive.testzip():raise SystemExit('Backup archive integrity check failed')
            manifest=json.loads(archive.read('manifest.json'))
            if manifest.get('version')!=1:raise SystemExit('Unsupported backup version')
            expected={t.name for t in Base.metadata.sorted_tables}
            if set(manifest['tables'])-expected:raise SystemExit('Backup contains unexpected tables')
            media=[]
            for key,entry in manifest['media'].items():
                data=archive.read(entry['file'])
                if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise SystemExit('Backup media hash mismatch')
                if not key.startswith('clubs/') or '..' in key:raise SystemExit('Unsafe media key')
                media.append((key,data))
            with engine.begin() as con:
                occupied=con.scalar(text('SELECT count(*) FROM information_schema.tables WHERE table_schema=:s'),{'s':target})
                if occupied:raise SystemExit('Restore target must be empty')
            result=subprocess.run([sys.executable,'-m','scripts.migrate','--init-schema'],env=dict(os.environ),capture_output=True,text=True)
            if result.returncode:raise SystemExit('Target migration failed; no backup data restored')
            with engine.begin() as con:
                for table in Base.metadata.sorted_tables:
                    rows=manifest['tables'].get(table.name,[])
                    if not rows:continue
                    if table.name=='hosts':rows=[dict(r,session_version=r['session_version']+1) for r in rows]
                    if table.name=='email_tokens':rows=[dict(r,used=True) for r in rows]
                    translated=con.execution_options(schema_translate_map={settings['schema']:target})
                    translated.execute(table.insert(),rows)
                    if 'id' in table.c and isinstance(table.c.id.type,Integer):
                        sequence=con.scalar(text('SELECT pg_get_serial_sequence(:tbl,\'id\')'),{'tbl':f'"{target}"."{table.name}"'})
                        if sequence:
                            maximum=max(row['id'] for row in rows)
                            con.execute(text('SELECT setval(CAST(:seq AS regclass),:value,true)'),{'seq':sequence,'value':maximum})
            if not args.skip_media:
                for key,data in media:
                    if use_blob():
                        from vercel.blob import sync as blob
                        try:existing=blob.get_blob(key,access='private').body
                        except Exception:existing=None
                        if existing is not None and hashlib.sha256(existing).digest()!=hashlib.sha256(data).digest():raise RuntimeError('Refusing to overwrite a different media object')
                        if existing is None:blob.put_blob(key,data,access='private',content_type='image/png')
                    else:
                        dest=local_path(key)
                        if dest.exists() and dest.read_bytes()!=data:raise RuntimeError('Refusing media overwrite')
                        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            print('Restore completed into dedicated target schema. Old sessions and account links invalidated.')
    engine.dispose()


if __name__=='__main__':main()

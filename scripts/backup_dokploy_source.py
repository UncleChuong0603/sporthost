"""Read-only native schema and verified-volume backup, independent of ORM revision.

Writes private artifacts only below gitignored .vercel/. No restore/migration command.
Credentials are read from a private env file, never passed on the command line.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import MetaData, create_engine, select, text
from sqlalchemy.engine import make_url


def rows_hash(rows):
    records = sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False, default=str) for row in rows)
    return hashlib.sha256('\n'.join(records).encode()).hexdigest()


def pg_environment(url):
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST=url.host or '', PGPORT=str(url.port or 5432), PGDATABASE=url.database or '',
               PGUSER=url.username or '', PGPASSWORD=url.password or '', PGCONNECT_TIMEOUT='15',
               PGSSLMODE=url.query.get('sslmode', 'require'), PGAPPNAME='sporthost-readonly-backup',
               PGOPTIONS='-c default_transaction_read_only=on')
    if url.query.get('channel_binding'):
        env['PGCHANNELBINDING'] = url.query['channel_binding']
    return env


def native_run(args, env, private_log):
    result = subprocess.run(args, env=env, capture_output=True, timeout=180)
    if result.returncode:
        private_log.write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Native backup failed; details retained in private artifact')
    return result.stdout


def backup(args):
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', args.schema) or args.schema in ('public', 'information_schema') or args.schema.startswith('pg_'):
        raise ValueError('Use a dedicated SportHost schema')
    private_root = Path('.vercel').resolve()
    root = Path(args.output_dir).resolve()
    if not root.is_relative_to(private_root):
        raise ValueError('Backup destination must stay below gitignored .vercel')
    root.mkdir(parents=True, exist_ok=False)
    values = dotenv_values(args.env_file)
    raw = values.get('DATABASE_URL_UNPOOLED') or values.get('DATABASE_URL')
    if not raw or '[SENSITIVE]' in raw:
        raise ValueError('A usable database credential is required in the private env file')
    url = make_url(raw)
    if url.get_backend_name() != 'postgresql':
        raise ValueError('PostgreSQL is required')
    engine = create_engine(url.set(drivername='postgresql+psycopg'),
                           connect_args={'connect_timeout':15, 'options':'-c default_transaction_read_only=on'})
    pg_bin = Path(args.pg_bin).resolve()
    suffix = '.exe' if os.name == 'nt' else ''
    dump = pg_bin / ('pg_dump' + suffix)
    restore = pg_bin / ('pg_restore' + suffix)
    archive = root / 'sporthost-schema.dump'
    manifest = {'format':1, 'schema':args.schema, 'created_utc':datetime.now(timezone.utc).isoformat(),
                'tables':{}, 'media':{},
                'source_fingerprint':hashlib.sha256(f'{url.host}|{url.port}|{url.database}|{args.schema}'.encode()).hexdigest()}
    try:
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as con, con.begin():
            manifest['client_tls'] = bool(con.connection.driver_connection.pgconn.ssl_in_use)
            if not manifest['client_tls'] and url.host not in ('localhost', '127.0.0.1', '::1'):
                raise ValueError('External database backup requires TLS')
            metadata = MetaData()
            metadata.reflect(bind=con, schema=args.schema, resolve_fks=False)
            if f'{args.schema}.alembic_version' not in metadata.tables:
                raise ValueError('SportHost migration history not found')
            snapshot = con.scalar(text('SELECT pg_export_snapshot()'))
            manifest['revision'] = con.scalar(select(metadata.tables[f'{args.schema}.alembic_version'].c.version_num))
            for table in metadata.tables.values():
                rows = con.execute(select(table)).mappings().all()
                manifest['tables'][table.name] = {'columns':[c.name for c in table.columns],
                                                   'count':len(rows), 'sha256':rows_hash(rows)}
            native_run([str(dump), '--no-password', '--schema='+args.schema, '--format=custom',
                        '--no-owner', '--no-acl', '--snapshot='+snapshot, '--file='+str(archive)],
                       pg_environment(url), root/'native-error.private.log')
        # Listing checks the native archive header/TOC; actual restore is a separate local verification.
        toc = native_run([str(restore), '--list', str(archive)], dict(os.environ), root/'native-error.private.log')
        if not toc or args.schema.encode() not in toc:
            raise RuntimeError('Native archive inventory verification failed')
        (root/'archive-toc.private.txt').write_bytes(toc)
        manifest['dump_sha256'] = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
        manifest['native_archive_readable'] = True
        manifest['media_verified'] = False
        if getattr(args, 'volume_media_manifest', None):
            volume_path = Path(args.volume_media_manifest).resolve()
            if not volume_path.is_relative_to(private_root):
                raise ValueError('Volume manifest must be a private local artifact')
            volume = json.loads(volume_path.read_text(encoding='utf8'))
            if not volume.get('binary_sha256_verified') or volume.get('source_fingerprint') != manifest['source_fingerprint']:
                raise ValueError('Volume backup source identity does not match this database')
            with engine.connect() as con:
                con.exec_driver_sql('SET TRANSACTION READ ONLY')
                asset_table = metadata.tables[f'{args.schema}.stored_assets']
                current = con.execute(select(asset_table)).mappings().all()
                if rows_hash(current) != manifest['tables']['stored_assets']['sha256']:
                    raise RuntimeError('Media records changed during backup; freeze writes and retry')
                expected = {row['key']:(row['sha256'],row['size']) for row in current}
            if expected != {row['key']:(row['sha256'],row['size']) for row in volume['assets']}:
                raise RuntimeError('Volume asset inventory does not match the database snapshot')
            with zipfile.ZipFile(root/'sporthost-media.zip', 'x', zipfile.ZIP_DEFLATED) as media:
                for index, row in enumerate(volume['assets']):
                    if not re.fullmatch(r'clubs/[1-9][0-9]*/(?:qr|proof)/[A-Za-z0-9_-]{24,128}\.png',row['key']):
                        raise ValueError('Unexpected private image key')
                    if not row['size']:
                        continue
                    body = (volume_path.parent/'media'/row['key']).read_bytes()
                    if len(body) != row['size'] or hashlib.sha256(body).hexdigest() != row['sha256']:
                        raise RuntimeError('Volume media hash mismatch')
                    entry = f'media/{index:08d}.bin';media.writestr(entry,body)
                    manifest['media'][row['key']] = {'file':entry,'sha256':row['sha256'],'size':row['size']}
            with zipfile.ZipFile(root/'sporthost-media.zip') as media:
                if media.testzip():raise RuntimeError('Media archive CRC failed')
                for info in manifest['media'].values():
                    if hashlib.sha256(media.read(info['file'])).hexdigest()!=info['sha256']:raise RuntimeError('Media archive hash mismatch')
            manifest['media_verified'] = True
            manifest['media_backend'] = 'dokploy-volume'
        else:
            raise ValueError('A verified Dokploy volume manifest is required')
        (root/'manifest.private.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        summary = {'backup_directory':str(root.relative_to(Path.cwd().resolve())),
                   'revision':manifest['revision'], 'tables':len(manifest['tables']),
                   'rows':sum(t['count'] for t in manifest['tables'].values()),
                   'client_tls':manifest['client_tls'], 'native_archive_readable':True,
                   'dump_sha256':manifest['dump_sha256'], 'media_files':len(manifest['media']),
                   'media_verified':manifest['media_verified'],
                   'media_backend':'dokploy-volume'}
        print(json.dumps(summary, indent=2))
        return 0 if manifest['media_verified'] else 2
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--schema', required=True)
    parser.add_argument('--pg-bin', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--volume-media-manifest', required=True, help='Verified binary volume manifest from backup_nextjs_media')
    args = parser.parse_args()
    try:
        status = backup(args)
    except Exception as exc:
        raise SystemExit('Read-only backup failed ('+type(exc).__name__+'); no production data changed') from None
    raise SystemExit(status)


if __name__ == '__main__':
    main()

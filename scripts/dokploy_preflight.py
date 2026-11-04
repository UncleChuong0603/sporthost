"""Read-only repo/env/database/VPS checks. Never prints secret values or server IPs.

python -m scripts.dokploy_preflight --env-file PRIVATE_FILE --database --schema clubhost
python -m scripts.dokploy_preflight --ssh sporthost
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

from dotenv import dotenv_values

KEYS = ('APP_ENV', 'DATABASE_URL', 'DB_SCHEMA', 'SECRET_KEY', 'COOKIE_SECURE', 'APP_URL',
        'APP_READ_ONLY',
        'PUBLIC_BASE_URL', 'ALLOWED_HOSTS', 'PORT', 'FORWARDED_ALLOW_IPS', 'STORAGE_BACKEND',
        'STORAGE_ROOT', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'EMAIL_ENABLED', 'EMAIL_PROVIDER',
        'EMAIL_FROM', 'RESEND_API_KEY', 'ADMIN_EMAILS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER',
        'SMTP_PASSWORD', 'MAIL_FROM', 'PLATFORM_TRIAL_DAYS', 'PLATFORM_CLUB_MONTHLY_VND')


def database(values, schema):
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', schema) or schema in ('public', 'information_schema') or schema.startswith('pg_'):
        raise ValueError('A dedicated schema is required')
    url = make_url(values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    engine = create_engine(url, connect_args={'connect_timeout': 10})
    try:
        with engine.connect() as con, con.begin():
            con.execute(text('SET TRANSACTION READ ONLY'))
            result = {'client_tls': bool(con.connection.driver_connection.pgconn.ssl_in_use),
                      'schema_exists': con.scalar(text('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=:s)'), {'s': schema})}
            if result['schema_exists']:
                result['revision'] = con.scalar(text(f'SELECT version_num FROM "{schema}".alembic_version'))
                result['schema_usage'] = con.scalar(text("SELECT has_schema_privilege(current_user,:s,'USAGE')"), {'s': schema})
                result['counts'] = {table: con.scalar(text(f'SELECT count(*) FROM "{schema}"."{table}"'))
                                    for table in ('hosts', 'clubs', 'game_sessions', 'bookings', 'stored_assets', 'payment_proofs')}
            return result
    finally:
        engine.dispose()


REMOTE = '''import json,os,platform,shutil,subprocess
from urllib.request import urlopen
result={'os':platform.system(),'python':platform.python_version(),'cpu_count':os.cpu_count()}
disk=shutil.disk_usage('/')
result['disk']={'total_gib':round(disk.total/2**30,1),'free_gib':round(disk.free/2**30,1)}
v=os.statvfs('/');result['inode_free_percent']=round(v.f_favail/v.f_files*100,1)
result['memory_kib']={k:int(val.split()[0]) for k,val in (line.split(':',1) for line in open('/proc/meminfo')) if k in ('MemTotal','MemAvailable','SwapTotal','SwapFree')}
try:
 with urlopen('http://127.0.0.1:3000/',timeout=5) as response:
  result['dokploy_http']=response.status
  result['dokploy_marker']='dokploy' in response.read().decode(errors='ignore').lower()
except Exception:result['dokploy_http']='unreachable'
proc=subprocess.run(['docker','ps','--format','{{json .}}'],capture_output=True,text=True,timeout=10)
result['docker_read_access']=proc.returncode==0
if proc.returncode==0:
 result['containers']=[{k:r.get(k) for k in ('Names','Image','Status')} for r in map(json.loads,proc.stdout.splitlines())]
print(json.dumps(result))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file')
    parser.add_argument('--database', action='store_true')
    parser.add_argument('--schema')
    parser.add_argument('--ssh', metavar='ALIAS')
    args = parser.parse_args()
    values = dotenv_values(args.env_file) if args.env_file else {}
    if args.env_file:
        print(json.dumps({'env': {k: ('redacted' if values.get(k) == '[SENSITIVE]' else
                                     'present' if values.get(k) else 'missing') for k in KEYS}}, indent=2))
    if args.database:
        if not args.env_file or not args.schema:
            parser.error('--database requires --env-file and explicit --schema')
        try:
            print(json.dumps({'database': database(values, args.schema)}, indent=2))
        except Exception:
            raise SystemExit('Database preflight failed; no connection details printed') from None
    if args.ssh:
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', args.ssh) or args.ssh.startswith('-'):
            parser.error('Use an SSH alias, not command arguments')
        proc = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', args.ssh,
                               'python3', '-'], input=REMOTE.encode(), capture_output=True, timeout=30)
        if proc.returncode:
            raise SystemExit('SSH preflight failed; check alias/access locally')
        print(json.dumps({'server': json.loads(proc.stdout)}, indent=2))


if __name__ == '__main__':
    main()

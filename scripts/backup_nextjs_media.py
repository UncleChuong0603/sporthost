"""Read-only, binary-safe backup of SportHost's private Dokploy upload volume.

Operator tooling only, outside the Node application image. No database writes,
DNS edits, service restart or storage deletion. All output stays gitignored.
"""
import argparse
import base64
import hashlib
import json
import re
import shlex
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
APPLICATIONS = {'jDjFowxqtg40YPaQ8y_NA': 'sporthost-v2-preview-bwtxar', 'oUctLiT_1JGDfDXbDDlwL': 'app-generate-auxiliary-capacitor-z5dy1q'}
KEY = re.compile(r'clubs/[1-9][0-9]*/(?:qr|proof)/[A-Za-z0-9_-]{24,128}\.png')
REMOTE = '''import json,sys,urllib.request,urllib.parse
p=json.load(sys.stdin)
assert p['app'] in ('jDjFowxqtg40YPaQ8y_NA','oUctLiT_1JGDfDXbDDlwL')
def get(endpoint,query):
 request=urllib.request.Request('http://127.0.0.1:3000/api/'+endpoint+'?'+urllib.parse.urlencode(query),headers={'x-api-key':p['key']})
 with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
containers=get('docker.getContainersByAppNameMatch',{'appName':p['app_name']})
running=[row for row in containers if row.get('state')=='running']
assert len(running)==1
print(json.dumps({'containerId':running[0]['containerId']}),flush=True)
for path in p['paths']:
 assert path.startswith('/data/uploads/clubs/') and '..' not in path
 result=get('docker.readContainerFile',{'containerId':running[0]['containerId'],'path':path})
 print(json.dumps({'path':path,'content':result['content'],'truncated':result.get('truncated',False)}),flush=True)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--application-id', choices=tuple(APPLICATIONS), required=True)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    destination = args.output_dir.resolve()
    if not destination.is_relative_to((ROOT / '.vercel').resolve()):
        raise ValueError('Backups must remain in the ignored private artifact directory')
    destination.mkdir(parents=True, exist_ok=True)
    if (destination / 'manifest.private.json').exists():
        raise ValueError('Use a new immutable backup directory')
    values = dotenv_values(args.env_file)
    url = values['DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://')
    if args.application_id == 'jDjFowxqtg40YPaQ8y_NA' and '/sporthost_v2_preview_c2905007' not in url:
        raise ValueError('Preview backup requires its isolated database')
    with psycopg.connect(url, options='-c default_transaction_read_only=on', connect_timeout=15) as con:
        assets = [dict(zip(('key', 'sha256', 'size'), row)) for row in con.execute('SELECT key,sha256,size FROM clubhost.stored_assets ORDER BY id')]
    if any(not KEY.fullmatch(row['key']) for row in assets):
        raise ValueError('Unexpected storage key; operator review required')
    records = {row['key']: row for row in assets}
    paths = ['/data/uploads/' + row['key'] for row in assets if row['size']]
    payload = {'app': args.application_id, 'app_name': APPLICATIONS[args.application_id], 'paths': paths,
               'key': dotenv_values(ROOT / '.env.dokploy.local')['DOKPLOY_API_KEY']}
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', 'sporthost', 'python3 -c ' + shlex.quote(REMOTE)],
                            input=json.dumps(payload).encode(), capture_output=True, timeout=max(60, len(paths) * 35))
    if result.returncode:
        raise RuntimeError('Private media backup failed; no credentials or provider response logged')
    lines = result.stdout.splitlines()
    container = json.loads(lines[0])['containerId']
    copied = 0
    for line in lines[1:]:
        value = json.loads(line); key = value['path'].removeprefix('/data/uploads/')
        expected = records[key]
        if value['truncated']:
            raise RuntimeError('Provider truncated a private image; backup is incomplete')
        data = base64.b64decode(value['content'], validate=True)
        if len(data) != expected['size'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise RuntimeError('Private image hash/size mismatch')
        path = destination / 'media' / key; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
        copied += 1
    assert copied == len(paths), 'Incomplete media archive'
    parsed = urlsplit(url)
    fingerprint = hashlib.sha256(f'{parsed.hostname}|{parsed.port}|{parsed.path[1:]}|clubhost'.encode()).hexdigest()
    report = {'applicationId': args.application_id, 'containerId': container, 'source_fingerprint': fingerprint, 'images': copied,
              'tombstones': sum(not row['size'] for row in assets), 'bytes': sum(row['size'] for row in assets),
              'binary_sha256_verified': True, 'assets': assets, 'database_writes': 0}
    (destination / 'manifest.private.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({key: value for key, value in report.items() if key not in ('assets', 'containerId')}))


if __name__ == '__main__':
    main()

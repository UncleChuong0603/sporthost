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
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
APPLICATIONS = {'jDjFowxqtg40YPaQ8y_NA': 'sporthost-v2-preview-bwtxar', 'oUctLiT_1JGDfDXbDDlwL': 'app-generate-auxiliary-capacitor-z5dy1q'}
ORIGINS = {'jDjFowxqtg40YPaQ8y_NA': 'https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io',
           'oUctLiT_1JGDfDXbDDlwL': 'https://sporthost.online'}
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


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def host_cookie(session_path):
    """Use an existing host credential only; never create or forge a session."""
    value = json.loads(session_path.read_text(encoding='utf8'))['cookie']
    if not isinstance(value, str):
        raise ValueError('Invalid private host session')
    value = value.removeprefix('clubhost=')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{24,8192}', value):
        raise ValueError('Invalid private host session')
    return 'clubhost=' + value


def fetch_host_image(application_id, route, cookie, expected, opener=None):
    """Read through normal host authorization when the provider truncates a file."""
    if not route or not re.fullmatch(r'/(?:clubs/[1-9][0-9]*/qr|proofs/[1-9][0-9]*/image)', route):
        raise ValueError('No authorized current-image route; backup is incomplete')
    if not 0 < expected['size'] <= 4 * 1024 * 1024:
        raise ValueError('Invalid private image size')
    request = Request(ORIGINS[application_id] + route, headers={'Cookie': cookie, 'Accept': 'image/*'})
    try:
        with (opener or build_opener(NoRedirect())).open(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != request.full_url:
                raise RuntimeError('Private host image download requires a valid authorized session')
            data = response.read(expected['size'] + 1)
    except (HTTPError, URLError):
        raise RuntimeError('Private host image download failed; credentials and response not logged') from None
    if len(data) != expected['size'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
        raise RuntimeError('Private host image hash/size mismatch')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--application-id', choices=tuple(APPLICATIONS), required=True)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--host-session-file', type=Path, help='Existing private host session; optional authenticated fallback for provider truncation')
    args = parser.parse_args()
    destination = args.output_dir.resolve()
    if not destination.is_relative_to((ROOT / '.vercel').resolve()):
        raise ValueError('Backups must remain in the ignored private artifact directory')
    destination.mkdir(parents=True, exist_ok=False)
    cookie = None
    if args.host_session_file:
        if not args.host_session_file.resolve().is_relative_to((ROOT / '.vercel').resolve()):
            raise ValueError('Host session must stay in the ignored private artifact directory')
        cookie = host_cookie(args.host_session_file)
    values = dotenv_values(args.env_file)
    url = values['DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://')
    if args.application_id == 'jDjFowxqtg40YPaQ8y_NA' and '/sporthost_v2_preview_c2905007' not in url:
        raise ValueError('Preview backup requires its isolated database')
    with psycopg.connect(url, options='-c default_transaction_read_only=on', connect_timeout=15) as con:
        rows = con.execute('''SELECT a.key,a.sha256,a.size,
            CASE WHEN c.qr_key=a.key THEN '/clubs/'||c.id||'/qr'
                 WHEN p.id IS NOT NULL THEN '/proofs/'||p.id||'/image' END
            FROM clubhost.stored_assets a JOIN clubhost.clubs c ON c.id=a.club_id
            LEFT JOIN LATERAL (SELECT min(id) id FROM clubhost.payment_proofs WHERE asset_id=a.id) p ON true
            ORDER BY a.id''').fetchall()
        assets = [dict(zip(('key', 'sha256', 'size'), row[:3])) for row in rows]
        routes = {row[0]: row[3] for row in rows}
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
    authenticated_downloads = 0
    for line in lines[1:]:
        value = json.loads(line); key = value['path'].removeprefix('/data/uploads/')
        expected = records[key]
        if value['truncated']:
            if not cookie:
                raise RuntimeError('Provider truncated a private image; provide an existing authorized host session')
            data = fetch_host_image(args.application_id, routes[key], cookie, expected)
            authenticated_downloads += 1
        else:
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
    report['authenticated_full_downloads'] = authenticated_downloads
    (destination / 'manifest.private.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({key: value for key, value in report.items() if key not in ('assets', 'containerId')}))


if __name__ == '__main__':
    main()

"""Run the in-app reminder job using a private configuration file (no secrets on argv)."""
import argparse
import json
import os
import time
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run(config_path):
    config_path = Path(config_path).resolve()
    config = json.loads(config_path.read_text(encoding='utf8'))
    if config['origin'] not in ('https://sporthost.online', 'https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io'):
        raise ValueError('Unrecognized reminder destination')
    if not isinstance(config['secret'], str) or len(config['secret']) < 32:
        raise ValueError('Missing reminder credential')
    state_path = config_path.with_suffix('.state.json')
    cursor = json.loads(state_path.read_text(encoding='utf8'))['after'] if state_path.exists() else 0
    if not isinstance(cursor, int) or cursor < 0:
        raise ValueError('Invalid cursor')
    scanned = 0
    deadline = time.monotonic() + 600
    # Leave time for the next 15-minute invocation. Resume large inventories durably.
    for _ in range(200):
        if time.monotonic() >= deadline:
            break
        request = urllib.request.Request(config['origin'] + '/api/internal/reminders?after=' + str(cursor),
                                         data=b'', method='POST', headers={'Authorization': 'Bearer ' + config['secret']})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
            result = json.load(response)
        following = result['next']
        if following is not None and (not isinstance(following, int) or following <= cursor):
            raise ValueError('Unexpected reminder cursor')
        scanned += result['scanned']
        cursor = following or 0
        temporary = state_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'after': cursor}), encoding='utf8')
        os.chmod(temporary, 0o600)
        temporary.replace(state_path)
        if following is None:
            break
    print(json.dumps({'ok': True, 'scanned': scanned, 'scan_completed': cursor == 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        run(args.config)
    except Exception as error:
        raise SystemExit('Reminder run failed (' + type(error).__name__ + '); no credential or response body logged') from None

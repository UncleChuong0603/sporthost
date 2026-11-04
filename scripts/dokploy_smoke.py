"""GET-only smoke checks. Never signs up, uploads, sends mail or changes production data."""
import argparse
import json
from urllib.parse import urlsplit

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('origin')
    parser.add_argument('--allow-http-loopback', action='store_true')
    parser.add_argument('--expect-email-disabled', action='store_true')
    parser.add_argument('--host-header', help='Exact Dokploy hostname, only through an explicit loopback tunnel')
    args = parser.parse_args()
    url = urlsplit(args.origin)
    if (not url.hostname or url.username or url.password or url.path not in ('', '/')
            or url.query or url.fragment):
        parser.error('Supply an origin without credentials, path, query or fragment')
    if url.scheme != 'https' and not (url.scheme == 'http' and args.allow_http_loopback
                                                    and url.hostname in ('127.0.0.1', 'localhost', '::1')):
        parser.error('HTTPS is required except explicitly allowed loopback tests')
    if args.host_header:
        import re
        if (not args.allow_http_loopback or url.hostname not in ('127.0.0.1','localhost','::1')
                or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*',args.host_header)):
            parser.error('--host-header is only allowed for a valid hostname over an explicit loopback tunnel')
    paths = {'/': (200, 302, 303, 307, 308), '/health': (200,), '/ready': (200,),
             '/login': (200,), '/signup': (200,), '/static/style.css': (200,),
             '/dokploy-smoke-nonexistent': (404,), '/admin': (401, 403)}
    if args.expect_email_disabled:
        paths['/forgot-password'] = (503,)
    failed = False
    with httpx.Client(timeout=15, follow_redirects=False,
                      headers={'Host':args.host_header} if args.host_header else None) as client:
        for path, expected in paths.items():
            try:
                r = client.get(args.origin.rstrip('/') + path)
                ok = r.status_code in expected
                if path in ('/health', '/ready') and r.status_code == 200:
                    ok = ok and r.json() == {'ok': True}
                if path == '/static/style.css':
                    ok = ok and 'text/css' in r.headers.get('content-type', '')
                if path == '/health':
                    ok = ok and r.headers.get('x-content-type-options') == 'nosniff'
                print(json.dumps({'path': path, 'status': r.status_code, 'pass': ok}))
            except (httpx.HTTPError, ValueError):
                ok = False
                print(json.dumps({'path': path, 'pass': False, 'error': 'unreachable or invalid response'}))
            failed |= not ok
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()

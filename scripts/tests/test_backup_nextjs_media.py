import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError

from scripts.backup_nextjs_media import NoRedirect, fetch_host_image, host_cookie


APP = 'oUctLiT_1JGDfDXbDDlwL'
URL = 'https://sporthost.online/clubs/1/qr'
BODY = b'synthetic-private-image'
EXPECTED = {'size': len(BODY), 'sha256': hashlib.sha256(BODY).hexdigest()}


class Response:
    status = 200

    def __init__(self, body=BODY, url=URL):
        self.body, self.url = body, url

    def __enter__(self): return self
    def __exit__(self, *args): pass
    def geturl(self): return self.url
    def read(self, limit): return self.body[:limit]


class Opener:
    def __init__(self, response=None, error=None):
        self.response, self.error = response or Response(), error
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.error: raise self.error
        return self.response


class MediaBackupTests(unittest.TestCase):
    def test_existing_cookie_validation_rejects_header_injection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'session.private.json'
            token = 'x' * 40 + '.signed'
            for cookie in (token, 'clubhost=' + token):
                path.write_text(json.dumps({'cookie': cookie}))
                self.assertEqual(host_cookie(path), 'clubhost=' + token)
            for cookie in ('x' * 40 + '\r\nX-Test: bad', '', 'other=' + token, ['bad']):
                path.write_text(json.dumps({'cookie': cookie}))
                with self.assertRaises(ValueError): host_cookie(path)

    def test_exact_full_image_is_downloaded_from_fixed_origin(self):
        opener = Opener()
        self.assertEqual(fetch_host_image(APP, '/clubs/1/qr', 'clubhost=synthetic', EXPECTED, opener), BODY)
        self.assertEqual(opener.requests[0].full_url, URL)
        self.assertEqual(opener.requests[0].get_header('Cookie'), 'clubhost=synthetic')

    def test_missing_historical_or_external_routes_fail_before_network(self):
        opener = Opener()
        for route in (None, '//attacker.test', '/clubs/1/qr?redirect=bad', '/clubs/0/qr', '/clubs/1/../qr'):
            with self.assertRaises(ValueError): fetch_host_image(APP, route, 'secret', EXPECTED, opener)
        self.assertFalse(opener.requests)

    def test_redirects_are_never_followed_or_accepted(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://attacker.test'))
        with self.assertRaises(RuntimeError):
            fetch_host_image(APP, '/clubs/1/qr', 'secret', EXPECTED, Opener(Response(url='https://attacker.test')))

    def test_expired_or_unauthorized_sessions_fail_without_echoing_secrets(self):
        for status in (302, 401, 403):
            error = HTTPError(URL, status, 'synthetic-secret', {}, None)
            with self.assertRaises(RuntimeError) as result:
                fetch_host_image(APP, '/clubs/1/qr', 'secret', EXPECTED, Opener(error=error))
            self.assertNotIn('synthetic-secret', str(result.exception))

    def test_short_oversized_and_changed_images_fail(self):
        for body in (BODY[:-1], BODY + b'extra', b'x' * len(BODY)):
            with self.assertRaises(RuntimeError):
                fetch_host_image(APP, '/clubs/1/qr', 'secret', EXPECTED, Opener(Response(body=body)))

    def test_invalid_sizes_fail_before_network(self):
        for size in (0, -1, 5 * 1024 * 1024):
            with self.assertRaises(ValueError):
                fetch_host_image(APP, '/clubs/1/qr', 'secret', {**EXPECTED, 'size': size}, Opener())


if __name__ == '__main__': unittest.main()

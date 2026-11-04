"""Prove legacy Python -> Node cryptographic compatibility using synthetic data only."""
import hashlib
import hmac
import json
import subprocess
import argparse
import time
from pathlib import Path

from itsdangerous import URLSafeTimedSerializer, TimestampSigner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-fixtures', action='store_true')
    args = parser.parse_args()
    moment = 1793714400 if args.write_fixtures else int(time.time())
    class FixtureSigner(TimestampSigner):
        def get_timestamp(self):
            return moment
    secret = 'synthetic-offline-compatibility-secret-never-production'
    salt = bytes(range(16))
    passwords = ['legacy-password-123', 'Mật khẩu cầu lông 🏸', 'e\u0301' * 10, 'x' * 256, '🦉' * 128]
    fixture = {'secret': secret, 'now': moment, 'nonce': 'synthetic-nonce', 'passwords': [], 'tokens': []}
    for label, raw in zip(('ascii','vietnamese','combining','max-ascii','astral'),passwords):
        value = hashlib.pbkdf2_hmac('sha256', raw.encode(), salt, 310_000)
        fixture['passwords'].append({'label': label, 'password': raw, 'hash': salt.hex() + ':' + value.hex()})
    for token_salt, payload, age in (
        ('clubhost-session-v1', {'id': 42, 'v': 3}, 14 * 86400),
        ('clubhost-session-v1', {'id': 42}, 14 * 86400),
        ('clubhost-session-v1', {'booking': 84, 'key': 'a' * 64}, 30 * 86400),
        ('clubhost-csrf-v1', {'session': 'synthetic-cookie-' * 25}, 6 * 3600),
        ('sporthost-guest-review-v1', {'game': 'synthetic-game', 'phone': '0901234567', 'version': 'b' * 64}, 15 * 60),
    ):
        fixture['tokens'].append({'label': token_salt, 'salt': token_salt, 'payload': payload, 'maxAge': age,
                                 'token': URLSafeTimedSerializer(secret, salt=token_salt, signer=FixtureSigner).dumps(payload)})
    fixture['guestToken'] = hmac.new(secret.encode(), ('guest-booking-v2|' + fixture['nonce']).encode(), hashlib.sha256).hexdigest()
    fixture['guestDigest'] = hashlib.sha256(fixture['guestToken'].encode()).hexdigest()
    if args.write_fixtures:
        target = Path(__file__).resolve().parents[1] / 'v2/tests/fixtures/legacy-auth.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Synthetic Python-to-Node fixtures generated; no production credentials/data used.')
        return
    script = Path(__file__).with_name('audit_nextjs_auth.cjs')
    result = subprocess.run(['node', str(script)], input=json.dumps(fixture).encode(), capture_output=True, timeout=30)
    if result.returncode:
        raise SystemExit('Offline compatibility probe failed; no production data was used')
    print(result.stdout.decode())


if __name__ == '__main__':
    main()

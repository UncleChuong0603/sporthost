"""Read-only legacy oracle for disposable loopback v2 integration fixtures.

Private connection data arrives on stdin, never argv; no production URL is accepted.
This is a development regression tool, not part of the v2 runtime artifact.
"""
import json
import os
import sys
from urllib.parse import urlsplit


def main():
    value = json.load(sys.stdin)
    parsed = urlsplit(value['url'])
    if parsed.scheme not in ('postgresql', 'postgres') or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or not parsed.path.endswith('_test'):
        raise ValueError('Refused non-local test database')
    os.environ.update(APP_ENV='test', DATABASE_URL='postgresql+psycopg://' + value['url'].split('://', 1)[1],
                      DB_SCHEMA='clubhost', SECRET_KEY=value['secret'], COOKIE_SECURE='false',
                      APP_READ_ONLY='true', EMAIL_ENABLED='false', APP_URL='http://127.0.0.1:3000',
                      ALLOWED_HOSTS='127.0.0.1,localhost', STORAGE_BACKEND='local')
    for key in ('VERCEL', 'DATABASE_MIGRATION_URL', 'BLOB_READ_WRITE_TOKEN', 'RESEND_API_KEY'):
        os.environ.pop(key, None)
    from app.main import SessionLocal, GameSession, Booking, Member, booking_fee
    from app.finance_service import draft, fingerprint, balances, summary
    from app.booking_service import token_valid
    with SessionLocal() as db:
        db.connection().exec_driver_sql('SET TRANSACTION READ ONLY')
        game = db.get(GameSession, int(value['game_id']))
        calculation = draft(db, game)
        rows = balances(db, game)
        result = {'calculation': calculation, 'fingerprint': fingerprint(calculation), 'totals': summary(rows),
                  'payers': [{name: row[name] for name in ('booking_id', 'payer_participant_id', 'name', 'amount', 'received', 'refunded', 'net', 'outstanding', 'credit', 'status')} for row in rows]}
        if value.get('booking_id'):
            booking = db.get(Booking, int(value['booking_id']))
            result['booking_fee'] = booking_fee(game, booking, db.get(Member, booking.member_id), db)
            result['token_valid'] = token_valid(booking, value['key'])
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as error:
        print(json.dumps({'error_category': type(error).__name__}))
        raise SystemExit(1) from None

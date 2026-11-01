"""Finish the reviewed 0006 expand/deploy/contract cutover.

Usage: python -m scripts.scrub_booking_tokens --env-file PRIVATE_ENV --apply
Default is count-only. Existing links keep working via SHA-256 legacy digests.
"""
import argparse
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    values = dotenv_values(args.env_file)
    raw = values.get('DATABASE_URL_UNPOOLED') or values.get('DATABASE_URL')
    if not raw or '[SENSITIVE]' in raw:
        raise SystemExit('Usable existing PostgreSQL configuration is required')
    engine = create_engine(make_url(raw).set(drivername='postgresql+psycopg'), connect_args={'connect_timeout': 15})
    try:
        with engine.begin() as con:
            version = con.scalar(text('SELECT version_num FROM clubhost.alembic_version'))
            if version != '0006_group_bookings':
                raise SystemExit('This cutover is only for reviewed revision 0006_group_bookings')
            count = con.scalar(text("SELECT count(*) FROM clubhost.bookings WHERE access_key<>''"))
            if not args.apply:
                print(f'{count} legacy plaintext booking capabilities; no changes made')
                return
            # Include requests that completed on the previous deployment during cutover.
            con.execute(text('''UPDATE clubhost.bookings SET
                legacy_token_digest=encode(sha256(convert_to(access_key,'UTF8')),'hex'),
                token_expires_at=COALESCE(token_expires_at,(CURRENT_TIMESTAMP+interval '180 days')::text),
                access_key='' WHERE access_key<>'' '''))
            con.execute(text('''INSERT INTO clubhost.booking_participants
                (booking_id,member_id,position,name,gender,level,fee_amount)
                SELECT b.id,m.id,0,m.name,b.gender_at_booking,m.level,
                COALESCE(b.fee_amount,CASE WHEN m.kind='fixed' THEN g.fixed_fee ELSE g.guest_fee END)
                FROM clubhost.bookings b JOIN clubhost.members m ON m.id=b.member_id
                JOIN clubhost.game_sessions g ON g.id=b.session_id
                WHERE NOT EXISTS (SELECT 1 FROM clubhost.booking_participants p WHERE p.booking_id=b.id)
                ON CONFLICT (booking_id,position) DO NOTHING'''))
            assert con.scalar(text("SELECT count(*) FROM clubhost.bookings WHERE access_key<>''")) == 0
            print(f'{count} legacy capabilities hashed and plaintext removed; links preserved via digest')
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()

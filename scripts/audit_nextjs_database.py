"""Read-only PostgreSQL metadata/counts audit; never import application code.

Requires an explicit private env file and output path. Contains no row exports,
passwords, tokens, email addresses or connection URLs in its report/logs.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def audit(env_file, schema):
    values = dotenv_values(env_file)
    if schema != 'clubhost' or values.get('DB_SCHEMA') not in (None, '', '[SENSITIVE]', 'clubhost'):
        raise ValueError('Explicit owner-confirmed clubhost configuration required')
    url = make_url(values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    if url.get_backend_name() != 'postgresql':
        raise ValueError('PostgreSQL is required')
    engine = create_engine(url, isolation_level='REPEATABLE READ', connect_args={
        'connect_timeout': 10, 'options': '-c default_transaction_read_only=on'})
    try:
        with engine.connect() as con, con.begin():
            con.execute(text('SET TRANSACTION READ ONLY'))
            # The existing pooler rejects statement/lock timeouts in startup options.
            con.execute(text("SET LOCAL statement_timeout = '15s'"))
            con.execute(text("SET LOCAL lock_timeout = '3s'"))
            report = {'observed_at_utc': datetime.now(timezone.utc).isoformat(), 'schema': 'clubhost',
                'transaction_read_only': con.scalar(text('SHOW transaction_read_only')),
                'server_version': con.scalar(text('SHOW server_version')),
                'client_tls': bool(con.connection.driver_connection.pgconn.ssl_in_use),
                'revision': con.scalar(text('SELECT version_num FROM clubhost.alembic_version'))}
            tables = list(con.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname='clubhost' ORDER BY tablename")))
            from psycopg import sql
            # Identifiers originate in pg_catalog and are still quoted explicitly.
            report['counts'] = {name: con.exec_driver_sql(sql.SQL('SELECT count(*) FROM clubhost.{}').format(
                sql.Identifier(name)).as_string()).scalar_one() for name in tables}
            report['columns'] = [dict(row) for row in con.execute(text("""SELECT table_name,column_name,
                ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length,
                is_identity,identity_generation FROM information_schema.columns
                WHERE table_schema='clubhost' ORDER BY table_name,ordinal_position""")).mappings()]
            report['constraints'] = [dict(row) for row in con.execute(text("""SELECT c.relname AS table_name,
                k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid) AS definition
                FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
                JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clubhost'
                ORDER BY c.relname,k.conname""")).mappings()]
            report['indexes'] = [dict(row) for row in con.execute(text("""SELECT tablename,indexname,indexdef
                FROM pg_indexes WHERE schemaname='clubhost' ORDER BY tablename,indexname""")).mappings()]
            report['sequences'] = [dict(row) for row in con.execute(text("""SELECT sequencename,data_type,
                start_value,min_value,max_value,increment_by,cycle,cache_size
                FROM pg_sequences WHERE schemaname='clubhost' ORDER BY sequencename""")).mappings()]
            report['password_formats'] = dict(con.execute(text("""SELECT CASE
                WHEN password_hash ~ '^[0-9a-f]{32}:[0-9a-f]{64}$' THEN 'legacy_pbkdf2_sha256_310000'
                ELSE 'unknown_requires_private_review' END AS format,count(*)
                FROM clubhost.hosts GROUP BY 1""")).all())
            report['legacy_capabilities'] = dict(con.execute(text("""SELECT
                count(*) FILTER (WHERE access_key<>'') AS plaintext_booking_keys,
                count(*) FILTER (WHERE token_nonce='') AS bookings_without_nonce,
                count(*) FILTER (WHERE token_expires_at IS NULL) AS bookings_without_expiry
                FROM clubhost.bookings""")).mappings().one())
            report['monthly_capabilities_missing'] = con.scalar(text("SELECT count(*) FROM clubhost.monthly_dues WHERE access_key=''"))
            report['environment_presence_only'] = {name: bool(values.get(name)) for name in (
                'SECRET_KEY','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','EMAIL_FROM','BLOB_READ_WRITE_TOKEN')}
            return report
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--schema', required=True, choices=['clubhost'])
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    target = Path(args.output).resolve()
    private_root = Path(__file__).resolve().parents[1] / '.vercel'
    if not target.is_relative_to(private_root.resolve()):
        parser.error('Write live metadata only under the gitignored .vercel directory')
    if target.exists():
        parser.error('Refusing to overwrite prior evidence')
    try:
        report = audit(args.env_file, args.schema)
    except Exception as error:
        raise SystemExit('Read-only database audit failed: ' + type(error).__name__ + '; no credentials logged') from None
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, default=str) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('observed_at_utc','transaction_read_only','server_version',
        'client_tls','revision','counts','password_formats','legacy_capabilities','monthly_capabilities_missing',
        'environment_presence_only')}))


if __name__ == '__main__':
    main()

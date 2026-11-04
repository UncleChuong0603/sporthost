"""Check or explicitly apply the additive member-account table; never runs on app startup.

Credentials come from a private env file. --database must exactly match its target.
The reviewed SQL only creates one new table/index; it never updates legacy rows.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit
import psycopg
from psycopg import sql
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--runtime-role', help='Optional restricted preview role receiving CRUD on this new table only')
    args = parser.parse_args()
    raw = dotenv_values(args.env_file).get('DATABASE_URL', '').replace('postgresql+psycopg://', 'postgresql://')
    target = urlsplit(raw)
    if target.scheme != 'postgresql' or target.path != '/' + args.database:
        raise ValueError('Private env URL does not match the explicitly named target database')
    if args.runtime_role and args.runtime_role != args.database:
        raise ValueError('Restricted runtime-role grant must match the isolated database name')
    migration = Path(__file__).resolve().parents[1] / 'v2/migrations/0001_member_accounts.sql'
    with psycopg.connect(raw, autocommit=True, connect_timeout=15) as con:
        revision = con.execute('SELECT version_num FROM clubhost.alembic_version').fetchone()
        if revision != ('0011_fixed_member_fees',):
            raise ValueError('Unexpected legacy schema revision')
        existing = con.execute("SELECT to_regclass('clubhost.member_account_links')").fetchone()[0]
        if args.apply:
            con.execute(migration.read_text(encoding='utf8'))
            if args.runtime_role:
                con.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON clubhost.member_account_links TO {}').format(sql.Identifier(args.runtime_role)))
        if args.apply or existing:
            columns = con.execute("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='clubhost' AND table_name='member_account_links' ORDER BY ordinal_position").fetchall()
            if columns != [('member_id','integer','NO'),('account_id','integer','NO'),('linked_by_host_id','integer','YES'),('linked_at','character varying','NO')]:
                raise ValueError('Member link table does not match the reviewed migration')
            constraints = con.execute("SELECT contype,confdeltype FROM pg_constraint WHERE conrelid='clubhost.member_account_links'::regclass AND contype IN ('p','f')").fetchall()
            if sorted(constraints) != sorted([('p',' '),('f','c'),('f','c'),('f','n')]):
                raise ValueError('Member link constraints do not match the reviewed migration')
        print(json.dumps({'migration':'0001_member_accounts','database':args.database,'applied':args.apply,'already_present':bool(existing),'ready':bool(existing or args.apply),'legacy_revision_unchanged':True,'destructive_statements':0}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error_category':type(error).__name__,'details':'Migration stopped; no credential or row values logged'}))
        raise SystemExit(1)

"""Read-only connection preflight: python -m scripts.check_db.

No CREATE/DROP/ALTER, no listing records or logging secrets. Run through SSH
local forward; outputs only minimal readiness facts.
"""
from sqlalchemy import create_engine, text
from app.settings import load_settings


def main():
    settings = load_settings()
    if settings['driver'] != 'postgresql':
        raise SystemExit('Set PostgreSQL DATABASE_URL before checking remote database')
    engine = create_engine(settings['url'], pool_pre_ping=True, connect_args={'connect_timeout': 5})
    try:
        with engine.connect() as con:
            row = con.execute(text('''SELECT current_database() AS db, current_user AS role,
               current_setting('server_version') AS pg_version,
               EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=:schema) AS schema_exists'''),
                {'schema': settings['schema']}).mappings().one()
            print(f"PostgreSQL reachable: version={row['pg_version']}, database={row['db']}, role={row['role']}, schema={settings['schema']}, schema_exists={row['schema_exists']}")
            if row['schema_exists']:
                objects = con.scalar(text('''SELECT count(*) FROM information_schema.tables
                    WHERE table_schema=:schema AND table_type='BASE TABLE' '''),
                    {'schema': settings['schema']})
                print(f'Existing base tables inside target schema: {objects}. No changes performed.')
    finally:
        engine.dispose()

if __name__ == '__main__':
    main()

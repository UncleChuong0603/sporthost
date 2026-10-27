"""Run migrations separately from Vercel. Usage: python -m scripts.migrate --init-schema"""
import argparse
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from app.settings import load_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--init-schema', action='store_true',
                        help='Create only DB_SCHEMA if absent in the selected database')
    args = parser.parse_args()
    migration_url = os.getenv('DATABASE_MIGRATION_URL')
    if migration_url:
        os.environ['DATABASE_URL'] = migration_url
    settings = load_settings()
    if settings['driver'] != 'postgresql':
        raise SystemExit('Migration requires PostgreSQL; SQLite is local/demo only')
    schema = settings['schema']
    engine = create_engine(settings['url'], connect_args={'connect_timeout': 10})
    try:
        with engine.begin() as con:
            exists = con.scalar(text('SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=:s)'), {'s': schema})
            if not exists:
                if not args.init_schema:
                    raise SystemExit('Schema missing. Use --init-schema only for your dedicated SportHost database/schema.')
                # load_settings validates this identifier; never change search_path.
                con.execute(text(f'CREATE SCHEMA "{schema}"'))
                print(f'Created dedicated schema: {schema}')
    finally:
        engine.dispose()
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'alembic'))
    command.upgrade(config, 'head')
    command.current(config)


if __name__ == '__main__':
    main()

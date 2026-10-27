"""ClubHost migration environment. Never touches tables outside DB_SCHEMA."""
from logging.config import fileConfig
from alembic import context
from sqlalchemy import create_engine, pool, text
from app.settings import load_settings
from app.main import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
settings = load_settings()
if settings['driver'] != 'postgresql':
    raise RuntimeError('Alembic migrations require PostgreSQL. SQLite is demo/test only.')
schema = settings['schema']
target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        return name == schema
    if type_ == 'table':
        return parent_names.get('schema_name') == schema
    return True


def run_offline():
    context.configure(
        url=settings['url'], target_metadata=target_metadata,
        literal_binds=True, dialect_opts={'paramstyle': 'named'},
        version_table_schema=schema, include_schemas=True,
        include_name=include_name, compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_online():
    engine = create_engine(settings['url'], poolclass=pool.NullPool)
    with engine.connect() as connection:
        # Schema is explicitly provisioned by DBA/owner, not silently created.
        schema_exists = connection.scalar(text('SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :name)'), {'name': schema})
        if not schema_exists:
            raise RuntimeError(f'Dedicated schema {schema!r} does not exist; have DBA create it first. No tables changed.')
        # Refuse to reuse an occupied schema; an initial migration may only
        # target an empty dedicated namespace. No implicit stamping/adoption.
        table_names = set(connection.execute(text("""SELECT c.relname FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=:name AND c.relkind IN ('r','p')"""), {'name': schema}).scalars())
        expected_names = {t.name for t in target_metadata.tables.values()} | {'alembic_version'}
        unknown = table_names - expected_names
        if unknown:
            raise RuntimeError(f'Dedicated schema {schema!r} contains unexpected tables: {sorted(unknown)}; no migration performed.')
        if table_names and 'alembic_version' not in table_names:
            raise RuntimeError(f'Dedicated schema {schema!r} already contains tables but has no ClubHost migration history; refusing to adopt it.')
        # SELECTs above implicitly start a SQLAlchemy 2.x transaction. End it
        # before handing the connection to Alembic, or Alembic may detect an
        # external transaction and leave DDL uncommitted on connection close.
        connection.rollback()
        context.configure(
            connection=connection, target_metadata=target_metadata,
            version_table_schema=schema, include_schemas=True,
            include_name=include_name, compare_type=True,
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()

if context.is_offline_mode():
    run_offline()
else:
    run_online()

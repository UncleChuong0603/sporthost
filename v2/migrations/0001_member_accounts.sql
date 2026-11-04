-- Additive, operator-applied migration. Never run automatically at application startup.
-- Existing clubhost tables, rows, sequences and Alembic revision remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
CREATE TABLE IF NOT EXISTS clubhost.member_account_links (
    member_id integer PRIMARY KEY REFERENCES clubhost.members(id) ON DELETE CASCADE,
    account_id integer NOT NULL REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
    linked_by_host_id integer REFERENCES clubhost.hosts(id) ON DELETE SET NULL,
    linked_at character varying NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_member_account_links_account_id ON clubhost.member_account_links(account_id);
COMMIT;

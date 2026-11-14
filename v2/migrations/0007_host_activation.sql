-- First-party aggregate activation measurement; no contacts or file contents.
BEGIN;
CREATE TABLE IF NOT EXISTS clubhost.host_activation (
  account_id integer PRIMARY KEY REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  club_id integer REFERENCES clubhost.clubs(id) ON DELETE SET NULL,
  seen_at varchar NOT NULL,
  started_at varchar,
  dismissed_at varchar,
  club_at varchar,
  session_at varchar,
  share_at varchar
);
CREATE INDEX IF NOT EXISTS ix_host_activation_seen ON clubhost.host_activation(seen_at);
CREATE INDEX IF NOT EXISTS ix_host_activation_club ON clubhost.host_activation(club_id);
COMMIT;

-- Additive only. Apply explicitly before deploying the connection feature.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS clubhost.club_connection_invites (
  club_id integer PRIMARY KEY REFERENCES clubhost.clubs(id) ON DELETE CASCADE,
  token varchar(48) NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES clubhost.hosts(id) ON DELETE SET NULL,
  created_at varchar NOT NULL
);
CREATE TABLE IF NOT EXISTS clubhost.club_connection_requests (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubhost.clubs(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  note varchar(500) NOT NULL DEFAULT '',
  status varchar NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  member_id integer REFERENCES clubhost.members(id) ON DELETE SET NULL,
  reviewed_by integer REFERENCES clubhost.hosts(id) ON DELETE SET NULL,
  requested_at varchar NOT NULL,
  reviewed_at varchar,
  reason varchar(500) NOT NULL DEFAULT '',
  UNIQUE (club_id, account_id)
);
CREATE INDEX IF NOT EXISTS ix_connection_requests_account ON clubhost.club_connection_requests(account_id);
CREATE INDEX IF NOT EXISTS ix_connection_requests_queue ON clubhost.club_connection_requests(club_id,status);
COMMIT;

-- Additive, operator-applied migration. Never run from application startup.
BEGIN;
CREATE TABLE IF NOT EXISTS clubhost.host_tour_preferences (
  account_id integer PRIMARY KEY REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','paused','dismissed')),
  mission_id varchar(40),
  club_id integer REFERENCES clubhost.clubs(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at varchar NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_host_tour_preferences_club ON clubhost.host_tour_preferences(club_id);
CREATE TABLE IF NOT EXISTS clubhost.host_tour_progress (
  account_id integer NOT NULL REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  club_id integer NOT NULL REFERENCES clubhost.clubs(id) ON DELETE CASCADE,
  mission_id varchar(40) NOT NULL,
  completed_at varchar,
  skipped_at varchar,
  PRIMARY KEY (account_id, club_id, mission_id)
);
CREATE INDEX IF NOT EXISTS ix_host_tour_progress_club ON clubhost.host_tour_progress(club_id);
COMMIT;

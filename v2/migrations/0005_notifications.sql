BEGIN;
CREATE TABLE IF NOT EXISTS clubhost.notifications (
  id serial PRIMARY KEY,
  account_id integer NOT NULL REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES clubhost.members(id) ON DELETE CASCADE,
  club_id integer NOT NULL REFERENCES clubhost.clubs(id) ON DELETE CASCADE,
  booking_id integer REFERENCES clubhost.bookings(id) ON DELETE CASCADE,
  due_id integer REFERENCES clubhost.monthly_dues(id) ON DELETE CASCADE,
  event_key varchar(200) NOT NULL,
  kind varchar(40) NOT NULL,
  title varchar(200) NOT NULL,
  created_at varchar NOT NULL,
  read_at varchar,
  CONSTRAINT notifications_one_target CHECK ((booking_id IS NOT NULL)::int + (due_id IS NOT NULL)::int = 1),
  CONSTRAINT notifications_event_unique UNIQUE(account_id, event_key)
);
CREATE INDEX IF NOT EXISTS ix_notifications_account_id ON clubhost.notifications(account_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_booking_id ON clubhost.notifications(booking_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_due_id ON clubhost.notifications(due_id);
CREATE INDEX IF NOT EXISTS ix_notifications_member_id ON clubhost.notifications(member_id);
CREATE INDEX IF NOT EXISTS ix_notifications_club_id ON clubhost.notifications(club_id);
CREATE TABLE IF NOT EXISTS clubhost.notification_preferences (
  account_id integer PRIMARY KEY REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  reminders_enabled boolean NOT NULL DEFAULT false,
  updated_at varchar NOT NULL
);
CREATE TABLE IF NOT EXISTS clubhost.reminder_settings (
  club_id integer PRIMARY KEY REFERENCES clubhost.clubs(id) ON DELETE CASCADE,
  rsvp_enabled boolean NOT NULL DEFAULT false,
  payment_enabled boolean NOT NULL DEFAULT false,
  rsvp_lead_hours integer NOT NULL DEFAULT 24 CHECK (rsvp_lead_hours BETWEEN 1 AND 168),
  payment_interval_days integer NOT NULL DEFAULT 3 CHECK (payment_interval_days BETWEEN 1 AND 14),
  updated_at varchar NOT NULL
);
COMMIT;

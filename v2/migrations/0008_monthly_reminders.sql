BEGIN;
ALTER TABLE clubhost.reminder_settings
  ADD COLUMN IF NOT EXISTS monthly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_day integer NOT NULL DEFAULT 5 CHECK (monthly_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS monthly_interval_days integer NOT NULL DEFAULT 3 CHECK (monthly_interval_days BETWEEN 1 AND 14);
ALTER TABLE clubhost.notification_preferences
  ADD COLUMN IF NOT EXISTS monthly_reminders_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_notifications_monthly_cooldown
  ON clubhost.notifications(account_id, club_id, created_at DESC) WHERE kind='monthly_reminder';
COMMIT;

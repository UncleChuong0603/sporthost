-- Additive Phase 1 administration. Apply explicitly after 0002; never at startup.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS clubhost.account_controls (
  account_id integer PRIMARY KEY REFERENCES clubhost.hosts(id) ON DELETE CASCADE,
  suspended boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS clubhost.entity_registry (
  entity_type varchar(20) NOT NULL CHECK (entity_type IN ('user','club','session','host')),
  entity_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(entity_type, entity_id)
);
-- Deliberately do not backfill creation dates for historical records.
CREATE INDEX IF NOT EXISTS ix_entity_registry_created ON clubhost.entity_registry(entity_type, created_at, entity_id);
CREATE OR REPLACE FUNCTION clubhost.register_admin_entity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM clubhost.entity_registry WHERE entity_type=TG_ARGV[0] AND entity_id=OLD.id;
    IF TG_ARGV[0]='user' THEN DELETE FROM clubhost.entity_registry WHERE entity_type='host' AND entity_id=OLD.id; END IF;
    RETURN OLD;
  END IF;
  INSERT INTO clubhost.entity_registry(entity_type,entity_id) VALUES(TG_ARGV[0],NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION clubhost.register_admin_host() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account integer;
BEGIN
  IF TG_TABLE_NAME='clubs' THEN
    account := NEW.owner_id;
    IF EXISTS(SELECT 1 FROM clubhost.clubs WHERE owner_id=account AND id<>NEW.id)
       OR EXISTS(SELECT 1 FROM clubhost.club_access WHERE host_id=account) THEN RETURN NEW; END IF;
  ELSE
    account := NEW.host_id;
    IF EXISTS(SELECT 1 FROM clubhost.clubs WHERE owner_id=account)
       OR EXISTS(SELECT 1 FROM clubhost.club_access WHERE host_id=account AND id<>NEW.id) THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO clubhost.entity_registry(entity_type,entity_id) VALUES('host',account) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='admin_register_host_owner' AND tgrelid='clubhost.clubs'::regclass) THEN
    CREATE TRIGGER admin_register_host_owner AFTER INSERT ON clubhost.clubs FOR EACH ROW EXECUTE FUNCTION clubhost.register_admin_host();
    CREATE TRIGGER admin_register_host_cohost AFTER INSERT ON clubhost.club_access FOR EACH ROW EXECUTE FUNCTION clubhost.register_admin_host();
  END IF;
END $$;
-- Legacy timestamps are text. Parse offsets correctly; invalid historical values stay unknown.
CREATE OR REPLACE FUNCTION clubhost.admin_instant(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET timezone='UTC' AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='admin_register_user' AND tgrelid='clubhost.hosts'::regclass) THEN
    CREATE TRIGGER admin_register_user AFTER INSERT OR DELETE ON clubhost.hosts FOR EACH ROW EXECUTE FUNCTION clubhost.register_admin_entity('user');
    CREATE TRIGGER admin_register_club AFTER INSERT OR DELETE ON clubhost.clubs FOR EACH ROW EXECUTE FUNCTION clubhost.register_admin_entity('club');
    CREATE TRIGGER admin_register_session AFTER INSERT OR DELETE ON clubhost.game_sessions FOR EACH ROW EXECUTE FUNCTION clubhost.register_admin_entity('session');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS clubhost.admin_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id integer NOT NULL REFERENCES clubhost.hosts(id),
  action varchar(60) NOT NULL,
  target_type varchar(20) NOT NULL,
  target_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason varchar(500) NOT NULL,
  changes jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_admin_audit_created ON clubhost.admin_audit_events(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_actor ON clubhost.admin_audit_events(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_action ON clubhost.admin_audit_events(action,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_target ON clubhost.admin_audit_events(target_type,target_id,id DESC);
CREATE INDEX IF NOT EXISTS ix_admin_host_activity ON clubhost.audit_logs(host_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_club_activity ON clubhost.audit_logs(created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_admin_session_schedule ON clubhost.game_sessions(starts_at,id);
CREATE INDEX IF NOT EXISTS ix_admin_session_status ON clubhost.game_sessions(lifecycle_status,starts_at,id);
CREATE INDEX IF NOT EXISTS ix_admin_payment_paid ON clubhost.payment_orders(club_id,paid_at DESC,order_code DESC) WHERE status='PAID' AND paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_admin_payment_revenue ON clubhost.payment_orders(paid_at) WHERE status='PAID' AND paid_at IS NOT NULL;
COMMIT;

-- Reviewed additive migration. No changes to existing business records or legacy revision.
BEGIN;
CREATE TABLE IF NOT EXISTS clubhost.payment_orders (
  order_code bigint PRIMARY KEY,
  club_id integer REFERENCES clubhost.clubs(id) ON DELETE SET NULL,
  host_id integer NOT NULL REFERENCES clubhost.hosts(id),
  club_name varchar(100) NOT NULL,
  amount integer NOT NULL,
  original_amount integer NOT NULL,
  period_days integer NOT NULL,
  status varchar(20) NOT NULL,
  payment_link_id varchar(100),
  checkout_url varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  activated_until varchar,
  CONSTRAINT ck_payment_order_status CHECK (status IN ('CREATING','PENDING','PAID','CANCELLED','EXPIRED')),
  CONSTRAINT ck_payment_order_amount CHECK (amount > 0 AND original_amount >= amount AND period_days > 0)
);
CREATE INDEX IF NOT EXISTS ix_payment_orders_club ON clubhost.payment_orders(club_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_link ON clubhost.payment_orders(payment_link_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_active_club ON clubhost.payment_orders(club_id) WHERE status IN ('CREATING','PENDING');
COMMIT;

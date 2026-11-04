-- REVIEW ONLY: generated offline against a synthetic URL. NOT APPLIED.
-- Confirm the real production target, clone/backup/restore and obtain explicit approval first.
BEGIN;
-- Running upgrade 0010_payment_config_snapshot -> 0011_fixed_member_fees
ALTER TABLE clubhost.clubs ADD COLUMN fixed_fee INTEGER DEFAULT '50000' NOT NULL;
ALTER TABLE clubhost.clubs ADD COLUMN fixed_fee_male INTEGER;
ALTER TABLE clubhost.clubs ADD COLUMN fixed_fee_female INTEGER;
ALTER TABLE clubhost.game_sessions ALTER COLUMN monthly_policy SET DEFAULT 'SESSION_FEE';
UPDATE clubhost.alembic_version SET version_num='0011_fixed_member_fees' WHERE clubhost.alembic_version.version_num = '0010_payment_config_snapshot';
COMMIT;

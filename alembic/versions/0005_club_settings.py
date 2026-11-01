"""Sport catalog code and club defaults, preserving legacy fees and bookings.

Legacy product scope is exclusively badminton (README / BUILD_PLAN).
No session or financial data is backfilled or reinterpreted by this revision.
"""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0005_club_settings'
down_revision = '0004_full_roadmap'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    for name, default in (
        ('sport_type', 'badminton'), ('skill_guidance', ''),
        ('default_approval_mode', 'MANUAL_APPROVE'), ('cancellation_policy', ''),
        ('default_fee_mode', 'FIXED_PRICE'), ('venue_instructions', ''),
    ):
        op.add_column('clubs', sa.Column(name, sa.String(), nullable=False, server_default=default), schema=SCHEMA)
    op.add_column('clubs', sa.Column('default_capacity', sa.Integer(), nullable=False, server_default='20'), schema=SCHEMA)
    op.create_check_constraint('ck_club_default_capacity', 'clubs', 'default_capacity BETWEEN 1 AND 200', schema=SCHEMA)
    op.create_check_constraint('ck_club_approval_mode', 'clubs', "default_approval_mode IN ('MANUAL_APPROVE', 'AUTO_APPROVE')", schema=SCHEMA)
    op.create_check_constraint('ck_club_fee_mode', 'clubs', "default_fee_mode IN ('COST_SHARING', 'FIXED_PRICE')", schema=SCHEMA)


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; roll back application code and retain club settings, or restore a verified dedicated-schema backup')

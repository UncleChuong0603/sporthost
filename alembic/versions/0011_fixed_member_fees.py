"""Per-session defaults for registered fixed members; retain historical dues."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0011_fixed_member_fees'
down_revision = '0010_payment_config_snapshot'
branch_labels = None
depends_on = None


def upgrade():
    schema = load_settings()['schema']
    op.add_column('clubs', sa.Column('fixed_fee', sa.Integer(), nullable=False, server_default='50000'), schema=schema)
    for name in ('fixed_fee_male', 'fixed_fee_female'):
        op.add_column('clubs', sa.Column(name, sa.Integer(), nullable=True), schema=schema)
    op.alter_column('game_sessions', 'monthly_policy', server_default='SESSION_FEE', schema=schema)


def downgrade():
    raise RuntimeError('Fixed member fee settings must be retained; destructive downgrade disabled')

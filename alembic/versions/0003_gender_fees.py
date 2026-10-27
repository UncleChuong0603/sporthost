"""Optional male/female session prices and stable booking fee snapshots."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0003_gender_fees'
down_revision = '0002_member_gender'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    for name in ('fixed_fee_male', 'fixed_fee_female', 'guest_fee_male', 'guest_fee_female'):
        op.add_column('game_sessions', sa.Column(name, sa.Integer(), nullable=True), schema=SCHEMA)
    op.add_column('bookings', sa.Column('fee_amount', sa.Integer(), nullable=True), schema=SCHEMA)
    # Preserve the original common price for every booking that predates this feature.
    op.execute(sa.text(f'''UPDATE "{SCHEMA}".bookings AS b
        SET fee_amount = CASE WHEN m.kind = 'fixed' THEN g.fixed_fee ELSE g.guest_fee END
        FROM "{SCHEMA}".members AS m, "{SCHEMA}".game_sessions AS g
        WHERE b.member_id = m.id AND b.session_id = g.id AND b.fee_amount IS NULL'''))


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; booking prices must be preserved')

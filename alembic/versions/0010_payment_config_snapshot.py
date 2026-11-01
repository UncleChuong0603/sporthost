"""Snapshot static QR and bank details together, including monthly obligations."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision='0010_payment_config_snapshot'
down_revision='0009_close_permissions_platform'
branch_labels=None
depends_on=None


def upgrade():
    for table in ('bookings','monthly_dues'):
        op.add_column(table,sa.Column('payment_snapshot',sa.String(),nullable=False,server_default='{}'),schema=load_settings()['schema'])
    # No invented historical bank data. Runtime detects legacy QR/text mismatch explicitly.


def downgrade():raise RuntimeError('Payment destination history must be retained; destructive downgrade disabled')

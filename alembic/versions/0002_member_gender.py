"""Record member gender without guessing existing members' gender."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0002_member_gender'
down_revision = '0001_initial'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    op.add_column('members', sa.Column('gender', sa.String(), nullable=False,
                                     server_default='unspecified'), schema=SCHEMA)
    op.create_check_constraint('ck_member_gender', 'members',
                               "gender IN ('male', 'female', 'unspecified')", schema=SCHEMA)


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; member gender must be preserved')

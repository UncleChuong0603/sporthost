"""Per-person attendance, session lifecycle and future charge issue freeze."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0007_session_attendance'
down_revision = '0006_group_bookings'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    op.add_column('game_sessions', sa.Column('lifecycle_status', sa.String(), nullable=False, server_default='OPEN'), schema=SCHEMA)
    op.add_column('game_sessions', sa.Column('attendance_locked', sa.Boolean(), nullable=False, server_default=sa.false()), schema=SCHEMA)
    op.execute(sa.text(f'''UPDATE "{SCHEMA}".game_sessions SET lifecycle_status='CANCELLED' WHERE is_cancelled=true'''))
    op.create_check_constraint('ck_session_lifecycle', 'game_sessions',
        "lifecycle_status IN ('DRAFT','OPEN','IN_PROGRESS','PLAY_FINISHED','SETTLED','CANCELLED')", schema=SCHEMA)
    op.add_column('booking_participants', sa.Column('attendance_status', sa.String(), nullable=False, server_default='NOT_MARKED'), schema=SCHEMA)
    for name in ('arrived_at', 'left_at'):
        op.add_column('booking_participants', sa.Column(name, sa.String(), nullable=True), schema=SCHEMA)
    op.add_column('booking_participants', sa.Column('attendance_actor_id', sa.Integer(), sa.ForeignKey(f'{SCHEMA}.hosts.id'), nullable=True), schema=SCHEMA)
    op.add_column('booking_participants', sa.Column('attendance_version', sa.Integer(), nullable=False, server_default='0'), schema=SCHEMA)
    op.create_check_constraint('ck_participant_attendance', 'booking_participants',
        "attendance_status IN ('NOT_MARKED','CHECKED_IN','NO_SHOW')", schema=SCHEMA)
    # Preserve legacy evidence; false never means NO_SHOW, and arrival times cannot be guessed.
    op.execute(sa.text(f'''UPDATE "{SCHEMA}".booking_participants p SET attendance_status='CHECKED_IN'
        FROM "{SCHEMA}".bookings b WHERE p.booking_id=b.id AND b.attended=true'''))


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; attendance evidence must be retained')

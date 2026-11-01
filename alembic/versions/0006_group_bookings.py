"""Whole-group registrations, session policy snapshots and hashed capabilities.

Expand first: legacy plaintext is retained until the new application is deployed.
The operator then runs scrub_booking_tokens; old links continue via their digest.
"""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0006_group_bookings'
down_revision = '0005_club_settings'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    op.add_column('recurring_rules', sa.Column('policy_json', sa.String(), nullable=False, server_default='{}'), schema=SCHEMA)
    defaults = {'approval_mode': 'MANUAL_APPROVE', 'sport_snapshot': 'badminton', 'skill_guidance': '',
                'venue_instructions': '', 'cancellation_policy': '', 'participation_conditions': '', 'maps_url': ''}
    for name, default in defaults.items():
        op.add_column('game_sessions', sa.Column(name, sa.String(), nullable=False, server_default=default), schema=SCHEMA)
    for name in ('registration_deadline', 'cancellation_deadline'):
        op.add_column('game_sessions', sa.Column(name, sa.String(), nullable=True), schema=SCHEMA)
    op.create_check_constraint('ck_session_approval_mode', 'game_sessions', "approval_mode IN ('AUTO_APPROVE','MANUAL_APPROVE')", schema=SCHEMA)
    for name, default in (('token_nonce', ''), ('token_digest', ''), ('channel', 'direct'), ('decision_reason', ''), ('policy_snapshot', '{}')):
        op.add_column('bookings', sa.Column(name, sa.String(), nullable=False, server_default=default), schema=SCHEMA)
    for name in ('legacy_token_digest', 'token_expires_at'):
        op.add_column('bookings', sa.Column(name, sa.String(), nullable=True), schema=SCHEMA)
    op.add_column('bookings', sa.Column('token_revoked', sa.Boolean(), nullable=False, server_default=sa.false()), schema=SCHEMA)
    for name in ('token_digest', 'legacy_token_digest'):
        op.create_index('ix_bookings_' + name, 'bookings', [name], schema=SCHEMA)
    op.create_table('booking_participants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('booking_id', sa.Integer(), sa.ForeignKey(f'{SCHEMA}.bookings.id'), nullable=False),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey(f'{SCHEMA}.members.id'), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False), sa.Column('name', sa.String(), nullable=False),
        sa.Column('gender', sa.String(), nullable=False, server_default='unspecified'),
        sa.Column('level', sa.String(), nullable=False, server_default=''),
        sa.Column('fee_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('booking_id', 'position', name='uq_booking_participant_position'),
        sa.CheckConstraint("gender IN ('male','female','unspecified')", name='ck_participant_gender'),
        sa.CheckConstraint('fee_amount >= 0', name='ck_participant_fee'), schema=SCHEMA)
    op.create_index('ix_booking_participants_booking_id', 'booking_participants', ['booking_id'], schema=SCHEMA)
    op.execute(sa.text(f'''INSERT INTO "{SCHEMA}".booking_participants
        (booking_id, member_id, position, name, gender, level, fee_amount)
        SELECT b.id, m.id, 0, m.name, b.gender_at_booking, m.level,
        COALESCE(b.fee_amount, CASE WHEN m.kind='fixed' THEN g.fixed_fee ELSE g.guest_fee END)
        FROM "{SCHEMA}".bookings b JOIN "{SCHEMA}".members m ON m.id=b.member_id
        JOIN "{SCHEMA}".game_sessions g ON g.id=b.session_id'''))
    op.execute(sa.text(f'''UPDATE "{SCHEMA}".bookings SET
        legacy_token_digest=CASE WHEN access_key<>'' THEN encode(sha256(convert_to(access_key,'UTF8')),'hex') ELSE NULL END,
        token_expires_at=(CURRENT_TIMESTAMP + interval '180 days')::text'''))
    op.execute(sa.text(f'''UPDATE "{SCHEMA}".bookings b SET policy_snapshot=json_build_object(
        'cancellation_deadline',COALESCE(g.cancellation_deadline,g.starts_at),
        'cancellation_policy',g.cancellation_policy)::text
        FROM "{SCHEMA}".game_sessions g WHERE g.id=b.session_id'''))


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; preserve group participants and token history')

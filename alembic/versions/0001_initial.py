"""Create ClubHost tables inside its dedicated PostgreSQL schema only.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def upgrade():
    op.create_table('hosts',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        schema=SCHEMA,
    )
    op.create_index('ix_hosts_email', 'hosts', ['email'], unique=True, schema=SCHEMA)
    op.create_table('clubs',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('owner_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.hosts.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('location', sa.String(), nullable=False),
        schema=SCHEMA,
    )
    op.create_index('ix_clubs_owner_id', 'clubs', ['owner_id'], schema=SCHEMA)
    op.create_table('members',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('club_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.clubs.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('level', sa.String(), nullable=False),
        sa.UniqueConstraint('club_id', 'phone', name='uq_member_phone'),
        schema=SCHEMA,
    )
    op.create_index('ix_members_club_id', 'members', ['club_id'], schema=SCHEMA)
    op.create_table('game_sessions',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('club_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.clubs.id'), nullable=False),
        sa.Column('public_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('venue', sa.String(), nullable=False),
        sa.Column('starts_at', sa.String(), nullable=False),
        sa.Column('capacity', sa.Integer, nullable=False),
        sa.Column('fixed_fee', sa.Integer, nullable=False),
        sa.Column('guest_fee', sa.Integer, nullable=False),
        sa.Column('is_open', sa.Boolean, nullable=False),
        schema=SCHEMA,
    )
    op.create_index('ix_game_sessions_club_id', 'game_sessions', ['club_id'], schema=SCHEMA)
    op.create_index('ix_game_sessions_public_id', 'game_sessions', ['public_id'], unique=True, schema=SCHEMA)
    op.create_table('monthly_dues',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('member_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.members.id'), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer, nullable=False),
        sa.Column('paid', sa.Boolean, nullable=False),
        sa.UniqueConstraint('member_id', 'period', name='uq_member_month'),
        schema=SCHEMA,
    )
    op.create_index('ix_monthly_dues_member_id', 'monthly_dues', ['member_id'], schema=SCHEMA)
    op.create_table('bookings',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.game_sessions.id'), nullable=False),
        sa.Column('member_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.members.id'), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('paid', sa.Boolean, nullable=False),
        sa.Column('attended', sa.Boolean, nullable=False),
        sa.UniqueConstraint('session_id', 'member_id', name='uq_booking_member_session'),
        schema=SCHEMA,
    )
    op.create_index('ix_bookings_member_id', 'bookings', ['member_id'], schema=SCHEMA)
    op.create_index('ix_bookings_session_id', 'bookings', ['session_id'], schema=SCHEMA)
    op.create_table('expenses',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('session_id', sa.Integer, sa.ForeignKey(f'{SCHEMA}.game_sessions.id'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer, nullable=False),
        schema=SCHEMA,
    )
    op.create_index('ix_expenses_session_id', 'expenses', ['session_id'], schema=SCHEMA)


def downgrade():
    # Explicit destructive action is forbidden by policy. Rollbacks must be
    # reviewed manually and never drop potentially shared application data.
    raise RuntimeError('Destructive downgrade disabled; restore ClubHost schema from verified backup after DBA review')

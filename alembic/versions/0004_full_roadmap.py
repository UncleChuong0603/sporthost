"""Host workspace, recurring sessions, private payments and account operations."""
from datetime import datetime, timedelta, timezone
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0004_full_roadmap'
down_revision = '0003_gender_fees'
branch_labels = None
depends_on = None
SCHEMA = load_settings()['schema']


def column(name, type_=sa.String(), **kw):
    return sa.Column(name, type_, nullable=False, **kw)


def table(name, *columns):
    op.create_table(name, sa.Column('id', sa.Integer(), primary_key=True), *columns, schema=SCHEMA)


def fk(name, target, nullable=False):
    return sa.Column(name, sa.Integer(), sa.ForeignKey(f'{SCHEMA}.{target}.id'), nullable=nullable)


def upgrade():
    op.create_table('request_limits',sa.Column('id',sa.String(80),primary_key=True),column('bucket',sa.Integer()),column('hits',sa.Integer()),schema=SCHEMA)
    for name in ('email_verified', 'is_platform_admin'):
        op.add_column('hosts', column(name, sa.Boolean(), server_default=sa.false()), schema=SCHEMA)
    op.add_column('hosts', column('session_version', sa.Integer(), server_default='0'), schema=SCHEMA)
    for name in ('bank_name','account_holder','account_number','payment_note'):
        op.add_column('clubs', column(name, server_default=''), schema=SCHEMA)
    op.add_column('clubs', column('monthly_fee', sa.Integer(), server_default='300000'), schema=SCHEMA)
    for name in ('monthly_fee_male','monthly_fee_female'):
        op.add_column('clubs', sa.Column(name, sa.Integer(), nullable=True), schema=SCHEMA)
    for name in ('qr_key','trial_ends_at','pro_ends_at'):
        op.add_column('clubs', sa.Column(name, sa.String(), nullable=True), schema=SCHEMA)
    table('recurring_rules', fk('club_id','clubs'), column('title'), column('venue'), column('first_start'),
          column('weeks',sa.Integer()), column('capacity',sa.Integer()), column('fixed_fee',sa.Integer()),
          column('guest_fee',sa.Integer()), *[sa.Column(n,sa.Integer(),nullable=True) for n in
          ('fixed_fee_male','fixed_fee_female','guest_fee_male','guest_fee_female','capacity_male','capacity_female')],
          column('rsvp_hours',sa.Integer()),column('active',sa.Boolean()))
    table('club_access',fk('club_id','clubs'),fk('host_id','hosts'),column('role'),
          sa.UniqueConstraint('club_id','host_id',name='uq_club_cohost'))
    table('audit_logs',fk('club_id','clubs',True),fk('host_id','hosts',True),column('action'),column('details'),column('created_at'))
    table('stored_assets',fk('club_id','clubs'),column('key',unique=True),column('kind'),column('sha256'),column('size',sa.Integer()),column('created_at'))
    table('payment_proofs',fk('booking_id','bookings',True),fk('due_id','monthly_dues',True),fk('asset_id','stored_assets'),column('status'),
          fk('reviewed_by','hosts',True),column('created_at'),sa.Column('reviewed_at',sa.String(),nullable=True),column('note'))
    table('email_tokens',fk('host_id','hosts'),column('purpose'),column('digest',unique=True),column('expires_at'),column('used',sa.Boolean()))
    table('subscription_requests',fk('club_id','clubs'),column('months',sa.Integer()),column('amount',sa.Integer()),
          column('status'),column('reference'),column('created_at'),sa.Column('reviewed_at',sa.String(),nullable=True),fk('reviewed_by','hosts',True))
    for table_name,fields in {'recurring_rules':['club_id'],'club_access':['club_id','host_id'],'audit_logs':['club_id'],
           'stored_assets':['club_id'],'payment_proofs':['booking_id'],'email_tokens':['host_id'],'subscription_requests':['club_id']}.items():
        for field in fields:op.create_index(f'ix_{table_name}_{field}',table_name,[field],schema=SCHEMA)
    op.add_column('game_sessions',fk('recurring_rule_id','recurring_rules',True),schema=SCHEMA)
    op.add_column('game_sessions',sa.Column('rsvp_deadline',sa.String(),nullable=True),schema=SCHEMA)
    op.add_column('game_sessions',column('is_cancelled',sa.Boolean(),server_default=sa.false()),schema=SCHEMA)
    for name in ('capacity_male','capacity_female'):
        op.add_column('game_sessions',sa.Column(name,sa.Integer(),nullable=True),schema=SCHEMA)
    op.create_unique_constraint('uq_rule_occurrence','game_sessions',['recurring_rule_id','starts_at'],schema=SCHEMA)
    op.add_column('bookings',column('access_key',server_default=''),schema=SCHEMA)
    op.add_column('bookings',sa.Column('qr_key',sa.String(),nullable=True),schema=SCHEMA)
    op.add_column('bookings',column('payment_status',server_default='unpaid'),schema=SCHEMA)
    op.add_column('bookings',column('gender_at_booking',server_default='unspecified'),schema=SCHEMA)
    op.execute(sa.text(f'UPDATE "{SCHEMA}".bookings AS b SET gender_at_booking=m.gender FROM "{SCHEMA}".members AS m WHERE b.member_id=m.id'))
    op.add_column('monthly_dues',column('access_key',server_default=''),schema=SCHEMA)
    op.add_column('monthly_dues',sa.Column('qr_key',sa.String(),nullable=True),schema=SCHEMA)
    op.add_column('monthly_dues',column('payment_status',server_default='unpaid'),schema=SCHEMA)
    op.execute(sa.text(f'UPDATE "{SCHEMA}".monthly_dues SET payment_status=\'confirmed\' WHERE paid=true'))
    op.create_index('ix_payment_proofs_due_id','payment_proofs',['due_id'],schema=SCHEMA)
    op.execute(sa.text(f'UPDATE "{SCHEMA}".bookings SET payment_status=\'confirmed\' WHERE paid=true'))
    trial_end=(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()
    op.get_bind().execute(sa.text(f'UPDATE "{SCHEMA}".clubs SET trial_ends_at=:end WHERE trial_ends_at IS NULL'),{'end':trial_end})


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; preserve payment and audit records')

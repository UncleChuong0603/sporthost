"""Add immutable issued charges and manual receipts; preserve every legacy money row."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision = '0008_manual_billing'
down_revision = '0007_session_attendance'
branch_labels = None
depends_on = None
S = load_settings()['schema']


def fk(table):
    return sa.ForeignKey(f'{S}.{table}.id')


def upgrade():
    for name, default in (('fee_mode','FIXED_PRICE'), ('no_show_policy','FREE'), ('monthly_policy','EXEMPT_PAID')):
        op.add_column('game_sessions', sa.Column(name, sa.String(), nullable=False, server_default=default), schema=S)
    # Legacy sessions retain FIXED_PRICE irrespective of unimplemented club defaults.
    op.add_column('bookings', sa.Column('payer_mode', sa.String(), nullable=False, server_default='GROUP'), schema=S)
    for column in (sa.Column('charge_exempt',sa.Boolean(),nullable=False,server_default=sa.false()),
                   sa.Column('fee_discount',sa.Integer(),nullable=False,server_default='0'),
                   sa.Column('adjustment_reason',sa.String(),nullable=False,server_default='')):
        op.add_column('booking_participants', column, schema=S)
    for column in (sa.Column('category',sa.String(),nullable=False,server_default='OTHER'),
                   sa.Column('note',sa.String(),nullable=False,server_default=''),
                   sa.Column('created_by',sa.Integer(),fk('hosts')), sa.Column('created_at',sa.String()),
                   sa.Column('allocated',sa.Boolean(),nullable=False,server_default=sa.true())):
        op.add_column('expenses', column, schema=S)
    op.add_column('payment_proofs',sa.Column('reported_amount',sa.Integer()),schema=S)
    op.add_column('payment_proofs',sa.Column('payer_participant_id',sa.Integer(),fk('booking_participants')),schema=S)
    for table,name,condition in (
        ('game_sessions','ck_session_fee_mode',"fee_mode IN ('FIXED_PRICE','COST_SHARING')"),
        ('game_sessions','ck_session_no_show',"no_show_policy IN ('FREE','FULL')"),
        ('game_sessions','ck_session_monthly_policy',"monthly_policy IN ('EXEMPT_PAID','SESSION_FEE')"),
        ('bookings','ck_booking_payer_mode',"payer_mode IN ('GROUP','SPLIT')"),
        ('expenses','ck_expense_category',"category IN ('COURT','EQUIPMENT','OTHER')")):
        op.create_check_constraint(name,table,condition,schema=S)
    op.create_table('charge_batches',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('session_id',sa.Integer(),fk('game_sessions'),nullable=False),sa.Column('version',sa.Integer(),nullable=False),
        sa.Column('snapshot',sa.String(),nullable=False),sa.Column('issued_by',sa.Integer(),fk('hosts'),nullable=False),
        sa.Column('issued_at',sa.String(),nullable=False),sa.Column('closed_at',sa.String()),
        sa.UniqueConstraint('session_id',name='uq_session_charge_batch'),schema=S)
    op.create_index('ix_charge_batches_session_id','charge_batches',['session_id'],schema=S)
    op.create_table('charges',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('batch_id',sa.Integer(),fk('charge_batches'),nullable=False),
        sa.Column('booking_id',sa.Integer(),fk('bookings'),nullable=False),
        sa.Column('participant_id',sa.Integer(),fk('booking_participants'),nullable=False),
        sa.Column('payer_participant_id',sa.Integer(),fk('booking_participants')),
        sa.Column('amount',sa.Integer(),nullable=False),sa.Column('detail',sa.String(),nullable=False),
        sa.UniqueConstraint('batch_id','participant_id',name='uq_batch_participant'),
        sa.CheckConstraint('amount>=0',name='ck_charge_nonnegative'),schema=S)
    for name in ('batch_id','booking_id'):op.create_index('ix_charges_'+name,'charges',[name],schema=S)
    op.create_table('money_movements',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('session_id',sa.Integer(),fk('game_sessions'),nullable=False),
        sa.Column('booking_id',sa.Integer(),fk('bookings'),nullable=False),
        sa.Column('payer_participant_id',sa.Integer(),fk('booking_participants')),
        sa.Column('amount',sa.Integer(),nullable=False),sa.Column('kind',sa.String(),nullable=False),
        sa.Column('source',sa.String(),nullable=False),sa.Column('reference',sa.String(),nullable=False),
        sa.Column('reason',sa.String(),nullable=False),sa.Column('confirmed_by',sa.Integer(),fk('hosts'),nullable=False),
        sa.Column('occurred_at',sa.String(),nullable=False),sa.Column('created_at',sa.String(),nullable=False),
        sa.Column('request_key',sa.String(),nullable=False),sa.Column('proof_id',sa.Integer(),fk('payment_proofs')),
        sa.Column('reverses_id',sa.Integer(),fk('money_movements')),
        sa.UniqueConstraint('session_id','request_key',name='uq_money_request'),
        sa.UniqueConstraint('proof_id',name='uq_money_proof'),sa.UniqueConstraint('reverses_id',name='uq_money_reversal'),
        sa.CheckConstraint('amount!=0',name='ck_money_nonzero'),
        sa.CheckConstraint("(kind='RECEIVED' AND amount>0) OR (kind='REFUND_RECORDED' AND amount<0) OR kind='REVERSAL'",name='ck_money_sign'),
        sa.CheckConstraint("kind IN ('RECEIVED','REFUND_RECORDED','REVERSAL')",name='ck_money_kind'),
        sa.CheckConstraint("source IN ('BANK_TRANSFER','CASH','OTHER')",name='ck_money_source'),schema=S)
    for name in ('session_id','booking_id'):op.create_index('ix_money_movements_'+name,'money_movements',[name],schema=S)


def downgrade():
    raise RuntimeError('Financial history must be retained; destructive downgrade disabled')

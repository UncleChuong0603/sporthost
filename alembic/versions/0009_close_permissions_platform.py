"""Append-only charge adjustments, scoped co-host permissions, separate SaaS ledger."""
from alembic import op
import sqlalchemy as sa
from app.settings import load_settings

revision='0009_close_permissions_platform'
down_revision='0008_manual_billing'
branch_labels=None
depends_on=None
S=load_settings()['schema']


def fk(table):return sa.ForeignKey(f'{S}.{table}.id')


def upgrade():
    op.add_column('club_access',sa.Column('permissions',sa.String()),schema=S)
    op.create_table('charge_adjustments',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('batch_id',sa.Integer(),fk('charge_batches'),nullable=False),
        sa.Column('charge_id',sa.Integer(),fk('charges'),nullable=False),sa.Column('amount',sa.Integer(),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),sa.Column('reason',sa.String(),nullable=False),
        sa.Column('created_by',sa.Integer(),fk('hosts'),nullable=False),sa.Column('created_at',sa.String(),nullable=False),
        sa.Column('request_key',sa.String(),nullable=False),
        sa.UniqueConstraint('batch_id','version',name='uq_adjustment_version'),
        sa.UniqueConstraint('batch_id','request_key',name='uq_adjustment_request'),
        sa.CheckConstraint('amount!=0',name='ck_adjustment_nonzero'),schema=S)
    for name in ('batch_id','charge_id'):op.create_index('ix_charge_adjustments_'+name,'charge_adjustments',[name],schema=S)
    op.create_table('platform_ledger_entries',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('entry_date',sa.String(),nullable=False),sa.Column('direction',sa.String(),nullable=False),
        sa.Column('category',sa.String(),nullable=False),sa.Column('amount',sa.Integer(),nullable=False),
        sa.Column('note',sa.String(),nullable=False),sa.Column('created_by',sa.Integer(),fk('hosts'),nullable=False),
        sa.Column('created_at',sa.String(),nullable=False),sa.Column('updated_by',sa.Integer(),fk('hosts')),
        sa.Column('updated_at',sa.String()),sa.Column('version',sa.Integer(),nullable=False),
        sa.Column('request_key',sa.String(),nullable=False,unique=True),
        sa.CheckConstraint('amount>0',name='ck_platform_amount'),
        sa.CheckConstraint("direction IN ('INCOME','EXPENSE')",name='ck_platform_direction'),schema=S)


def downgrade():raise RuntimeError('Financial history and permission audit must be retained; destructive downgrade disabled')

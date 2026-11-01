"""Immutable issued charges and append-only manual money movements."""
from sqlalchemy import ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.main import Base
from app.models_extra import utc_now


class ChargeBatch(Base):
    __tablename__ = 'charge_batches'
    __table_args__ = (UniqueConstraint('session_id', name='uq_session_charge_batch'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('game_sessions.id'), index=True)
    version: Mapped[int] = mapped_column(default=1)
    snapshot: Mapped[str]
    issued_by: Mapped[int] = mapped_column(ForeignKey('hosts.id'))
    issued_at: Mapped[str] = mapped_column(default=utc_now)
    closed_at: Mapped[str | None]


class Charge(Base):
    __tablename__ = 'charges'
    __table_args__ = (UniqueConstraint('batch_id', 'participant_id', name='uq_batch_participant'),
                     CheckConstraint('amount >= 0', name='ck_charge_nonnegative'))
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey('charge_batches.id'), index=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey('bookings.id'), index=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey('booking_participants.id'))
    payer_participant_id: Mapped[int | None] = mapped_column(ForeignKey('booking_participants.id'))
    amount: Mapped[int]
    detail: Mapped[str]


class MoneyMovement(Base):
    __tablename__ = 'money_movements'
    __table_args__ = (UniqueConstraint('session_id', 'request_key', name='uq_money_request'),
                     UniqueConstraint('proof_id', name='uq_money_proof'),
                     UniqueConstraint('reverses_id', name='uq_money_reversal'),
                     CheckConstraint('amount != 0', name='ck_money_nonzero'),
                     CheckConstraint("(kind='RECEIVED' AND amount>0) OR (kind='REFUND_RECORDED' AND amount<0) OR kind='REVERSAL'",name='ck_money_sign'),
                     CheckConstraint("kind IN ('RECEIVED','REFUND_RECORDED','REVERSAL')", name='ck_money_kind'),
                     CheckConstraint("source IN ('BANK_TRANSFER','CASH','OTHER')", name='ck_money_source'))
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('game_sessions.id'), index=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey('bookings.id'), index=True)
    payer_participant_id: Mapped[int | None] = mapped_column(ForeignKey('booking_participants.id'))
    amount: Mapped[int]  # signed integer VND; positive receipts, negative refunds/reversals
    kind: Mapped[str]
    source: Mapped[str]
    reference: Mapped[str] = mapped_column(default='')
    reason: Mapped[str] = mapped_column(default='')
    confirmed_by: Mapped[int] = mapped_column(ForeignKey('hosts.id'))
    occurred_at: Mapped[str] = mapped_column(default=utc_now)
    created_at: Mapped[str] = mapped_column(default=utc_now)
    request_key: Mapped[str]
    proof_id: Mapped[int | None] = mapped_column(ForeignKey('payment_proofs.id'))
    reverses_id: Mapped[int | None] = mapped_column(ForeignKey('money_movements.id'))


class ChargeAdjustment(Base):
    __tablename__ = 'charge_adjustments'
    __table_args__ = (UniqueConstraint('batch_id','version',name='uq_adjustment_version'),
                     UniqueConstraint('batch_id','request_key',name='uq_adjustment_request'),
                     CheckConstraint('amount!=0',name='ck_adjustment_nonzero'))
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey('charge_batches.id'),index=True)
    charge_id: Mapped[int] = mapped_column(ForeignKey('charges.id'),index=True)
    amount: Mapped[int]
    version: Mapped[int]
    reason: Mapped[str]
    created_by: Mapped[int] = mapped_column(ForeignKey('hosts.id'))
    created_at: Mapped[str] = mapped_column(default=utc_now)
    request_key: Mapped[str]


class PlatformLedgerEntry(Base):
    __tablename__ = 'platform_ledger_entries'
    __table_args__ = (CheckConstraint('amount>0',name='ck_platform_amount'),
                     CheckConstraint("direction IN ('INCOME','EXPENSE')",name='ck_platform_direction'))
    id: Mapped[int] = mapped_column(primary_key=True)
    entry_date: Mapped[str]
    direction: Mapped[str]
    category: Mapped[str]
    amount: Mapped[int]
    note: Mapped[str]
    created_by: Mapped[int] = mapped_column(ForeignKey('hosts.id'))
    created_at: Mapped[str] = mapped_column(default=utc_now)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey('hosts.id'))
    updated_at: Mapped[str | None]
    version: Mapped[int] = mapped_column(default=0)
    request_key: Mapped[str] = mapped_column(unique=True)

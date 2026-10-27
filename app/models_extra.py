"""Additional roadmap models; private media bytes stay in object storage."""
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.main import Base


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class RecurringRule(Base):
    __tablename__ = 'recurring_rules'
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    title: Mapped[str]
    venue: Mapped[str]
    first_start: Mapped[str]
    weeks: Mapped[int]
    capacity: Mapped[int]
    capacity_male: Mapped[int | None]
    capacity_female: Mapped[int | None]
    fixed_fee: Mapped[int]
    guest_fee: Mapped[int]
    fixed_fee_male: Mapped[int | None]
    fixed_fee_female: Mapped[int | None]
    guest_fee_male: Mapped[int | None]
    guest_fee_female: Mapped[int | None]
    rsvp_hours: Mapped[int]
    active: Mapped[bool] = mapped_column(default=True)


class ClubAccess(Base):
    __tablename__ = 'club_access'
    __table_args__ = (UniqueConstraint('club_id', 'host_id', name='uq_club_cohost'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    host_id: Mapped[int] = mapped_column(ForeignKey('hosts.id'), index=True)
    role: Mapped[str]  # manager or finance; owner remains clubs.owner_id


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int | None] = mapped_column(ForeignKey('clubs.id'), index=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey('hosts.id'))
    action: Mapped[str]
    details: Mapped[str] = mapped_column(default='')
    created_at: Mapped[str] = mapped_column(default=utc_now)


class StoredAsset(Base):
    __tablename__ = 'stored_assets'
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    key: Mapped[str] = mapped_column(unique=True)
    kind: Mapped[str]
    sha256: Mapped[str]
    size: Mapped[int]
    created_at: Mapped[str] = mapped_column(default=utc_now)


class PaymentProof(Base):
    __tablename__ = 'payment_proofs'
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey('bookings.id'), index=True)
    due_id: Mapped[int | None] = mapped_column(ForeignKey('monthly_dues.id'), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey('stored_assets.id'))
    status: Mapped[str] = mapped_column(default='reported')
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey('hosts.id'))
    created_at: Mapped[str] = mapped_column(default=utc_now)
    reviewed_at: Mapped[str | None]
    note: Mapped[str] = mapped_column(default='')


class EmailToken(Base):
    __tablename__ = 'email_tokens'
    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey('hosts.id'), index=True)
    purpose: Mapped[str]
    digest: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[str]
    used: Mapped[bool] = mapped_column(default=False)


class SubscriptionRequest(Base):
    __tablename__ = 'subscription_requests'
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    months: Mapped[int]
    amount: Mapped[int]
    status: Mapped[str] = mapped_column(default='pending')
    reference: Mapped[str]
    created_at: Mapped[str] = mapped_column(default=utc_now)
    reviewed_at: Mapped[str | None]
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey('hosts.id'))

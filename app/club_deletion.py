"""Delete a club and its dependent records in one database transaction."""
import json
import logging

from sqlalchemy import delete, select, update

from app.main import (
    AuditLog, Booking, BookingParticipant, Charge, ChargeAdjustment, ChargeBatch,
    ClubAccess, Expense, GameSession, Member, MoneyMovement, MonthlyDue,
    PaymentProof, RecurringRule, StoredAsset, SubscriptionRequest,
)
from app.storage import delete_image

logger = logging.getLogger(__name__)


def delete_club_data(db, club, host_id):
    """Caller verifies ownership, CSRF and the typed club name before calling."""
    club_id, club_name = club.id, club.name
    games = select(GameSession.id).where(GameSession.club_id == club_id)
    members = select(Member.id).where(Member.club_id == club_id)
    bookings = select(Booking.id).where(Booking.session_id.in_(games))
    dues = select(MonthlyDue.id).where(MonthlyDue.member_id.in_(members))
    batches = select(ChargeBatch.id).where(ChargeBatch.session_id.in_(games))
    assets = select(StoredAsset.id).where(StoredAsset.club_id == club_id)
    asset_keys = db.scalars(select(StoredAsset.key).where(StoredAsset.club_id == club_id)).all()

    # Children first: production foreign keys do not cascade these records.
    for model, condition in (
        (ChargeAdjustment, ChargeAdjustment.batch_id.in_(batches)),
        (MoneyMovement, MoneyMovement.session_id.in_(games)),
        (Charge, Charge.batch_id.in_(batches)),
        (ChargeBatch, ChargeBatch.session_id.in_(games)),
        (PaymentProof, PaymentProof.booking_id.in_(bookings) |
         PaymentProof.due_id.in_(dues) | PaymentProof.asset_id.in_(assets)),
        (BookingParticipant, BookingParticipant.booking_id.in_(bookings)),
        (Booking, Booking.session_id.in_(games)),
        (Expense, Expense.session_id.in_(games)),
        (MonthlyDue, MonthlyDue.member_id.in_(members)),
        (GameSession, GameSession.club_id == club_id),
        (Member, Member.club_id == club_id),
        (RecurringRule, RecurringRule.club_id == club_id),
        (ClubAccess, ClubAccess.club_id == club_id),
        (SubscriptionRequest, SubscriptionRequest.club_id == club_id),
        (StoredAsset, StoredAsset.club_id == club_id),
    ):
        db.execute(delete(model).where(condition).execution_options(synchronize_session=False))

    # Retain the audit trail with the deleted club's identity, without its FK.
    db.execute(update(AuditLog).where(AuditLog.club_id == club_id).values(
        club_id=None, details=f'CLB #{club_id} ({club_name}) đã xóa.\n' + AuditLog.details))
    db.add(AuditLog(host_id=host_id, action='Xóa CLB', details=json.dumps(
        {'club_id': club_id, 'name': club_name}, ensure_ascii=False)))
    db.delete(club)
    db.commit()

    # Never remove files before commit: a failed transaction must keep them usable.
    for key in asset_keys:
        try:
            delete_image(key)
        except Exception:
            logger.exception('Could not remove stored image after deleting club %s: %s', club_id, key)

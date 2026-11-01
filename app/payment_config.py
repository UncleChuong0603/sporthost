"""Keep static QR and bank text in the same version for bookings and monthly dues."""
import json
from sqlalchemy import event
from sqlalchemy.orm import Session
from app.main import Booking,MonthlyDue,GameSession,Member,Club

FIELDS=('qr_key','bank_name','account_holder','account_number','payment_note')


def snapshot(club):return {name:getattr(club,name) for name in FIELDS}


@event.listens_for(Session,'before_flush')
def initialize_snapshots(db,flush_context,instances):
    for target in list(db.new):
        if not isinstance(target,(Booking,MonthlyDue)) or target.payment_snapshot not in (None,'{}',''):continue
        parent=db.get(GameSession,target.session_id) if isinstance(target,Booking) else db.get(Member,target.member_id)
        if parent:
            club=db.get(Club,parent.club_id)
            target.payment_snapshot=json.dumps(snapshot(club),ensure_ascii=False)


def target_payment(db,target,club,game=None):
    if game:
        from app.finance_service import batch_for
        batch=batch_for(db,game)
        if batch:return json.loads(batch.snapshot)['payment']
    saved=json.loads(target.payment_snapshot or '{}')
    if saved:return saved
    # No historical bank text exists for older rows. Do not pair an old image with new text.
    if target.qr_key and target.qr_key!=club.qr_key:
        return {**{key:'' for key in FIELDS},'qr_key':None,'needs_verification':True}
    return snapshot(club)

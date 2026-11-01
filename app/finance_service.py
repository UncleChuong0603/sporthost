"""Integer-VND billing. Callers lock the session before every financial mutation."""
import hashlib
import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.main import (Booking, BookingParticipant, Member, MonthlyDue, Expense, Club,
                      ChargeBatch, Charge, MoneyMovement, ChargeAdjustment, money)
from app.attendance import log_change


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def fingerprint(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


def batch_for(db, game):
    return db.scalar(select(ChargeBatch).where(ChargeBatch.session_id == game.id))


def require_draft(game, db):
    if game.is_cancelled or game.lifecycle_status == 'SETTLED' or game.attendance_locked or batch_for(db, game):
        raise HTTPException(409, 'Cơ sở tính phí đã khóa. Cần điều chỉnh có lý do, không sửa khoản đã phát hành.')


def draft(db, game):
    from app.main import booking_fee
    bookings = db.scalars(select(Booking).where(Booking.session_id == game.id,
                        Booking.status == 'confirmed').order_by(Booking.id)).all()
    expenses = db.scalars(select(Expense).where(Expense.session_id == game.id).order_by(Expense.id)).all()
    members = {m.id: m for m in db.scalars(select(Member).where(Member.club_id == game.club_id))}
    monthly_paid = set(db.scalars(select(MonthlyDue.member_id).join(Member).where(
        Member.club_id == game.club_id, MonthlyDue.period == game.starts_at[:7], MonthlyDue.paid.is_(True))))
    people = []
    for booking in bookings:
        accepted = json.loads(booking.policy_snapshot or '{}')
        for p in booking.participants:
            member = members.get(p.member_id)
            policy_monthly = accepted.get('monthly_policy', game.monthly_policy)
            policy_no_show = accepted.get('no_show_policy', game.no_show_policy)
            reason = ''
            if p.charge_exempt:
                reason = 'Miễn phí: ' + p.adjustment_reason
            elif member and member.kind == 'fixed' and member.id in monthly_paid and policy_monthly == 'EXEMPT_PAID':
                reason = 'Đã đóng phí tháng ' + game.starts_at[:7]
            elif p.attendance_status == 'NO_SHOW' and policy_no_show == 'FREE':
                reason = 'Vắng mặt được miễn theo chính sách đã nhận'
            people.append(dict(participant_id=p.id, booking_id=booking.id, name=p.name,
                payer_name=members[booking.member_id].name if booking.payer_mode == 'GROUP' else p.name,
                payer_participant_id=None if booking.payer_mode == 'GROUP' else p.id,
                attendance=p.attendance_status, arrived_at=p.arrived_at, left_at=p.left_at,
                unit_price=p.fee_amount, discount=p.fee_discount, adjustment_reason=p.adjustment_reason,
                exempt=bool(reason), explanation=reason, amount=0))
    eligible = [p for p in people if not p['exempt']]
    eligible.sort(key=lambda p:p['participant_id'])
    allocated = sum(e.amount for e in expenses if e.allocated)
    unallocated = sum(e.amount for e in expenses if not e.allocated)
    # Exact largest-remainder allocation to 1 VND, sorted by stable participant ID.
    # No rounded-away money: the first remainder participants pay one extra VND.
    quotient, remainder = divmod(allocated, len(eligible)) if eligible else (0, 0)
    for index, person in enumerate(eligible):
        base = quotient + (index < remainder) if game.fee_mode == 'COST_SHARING' else person['unit_price']
        person['amount'] = money(max(0, base - person['discount']))
        person['base'] = base
        person['explanation'] = ('Chia đều tới 1đ; thứ tự ID nhận phần dư' if game.fee_mode == 'COST_SHARING' else 'Đơn giá đã công bố')
        if person['left_at'] or person['arrived_at']:
            person['explanation'] += '; đến muộn/về sớm không tự giảm phí'
    club = db.get(Club, game.club_id)
    payment = {name: getattr(club, name) for name in ('qr_key', 'bank_name', 'account_holder', 'account_number', 'payment_note')}
    advances=[dict(booking_id=b.id,name=members[b.member_id].name,amount=booking_fee(game,b,members[b.member_id]))
              for b in db.scalars(select(Booking).where(Booking.session_id==game.id,Booking.paid.is_(True)).order_by(Booking.id))]
    return dict(fee_mode=game.fee_mode, no_show_policy=game.no_show_policy, monthly_policy=game.monthly_policy,
                people=people, expenses=[dict(id=e.id, title=e.title, amount=e.amount, category=e.category,
                    allocated=e.allocated, note=e.note, created_by=e.created_by, created_at=e.created_at) for e in expenses],
                total_expenses=allocated + unallocated, allocated_expenses=allocated, excluded_expenses=unallocated,
                total_due=sum(p['amount'] for p in people), billable_count=len(eligible),
                unmarked=sum(p['attendance'] == 'NOT_MARKED' for p in people), payment=payment,
                rounding='EXACT_VND_STABLE_ID', unallocated_cost=allocated if not eligible else 0,
                advances=advances,total_advanced=sum(a['amount'] for a in advances))


def balances(db, game, booking_id=None):
    batch = batch_for(db, game)
    if not batch:
        return []
    snapshot = json.loads(batch.snapshot)
    names = {p['participant_id']: p for p in snapshot['people']}
    query = select(Charge).where(Charge.batch_id == batch.id)
    if booking_id is not None:
        query = query.where(Charge.booking_id == booking_id)
    rows = {}
    adjustments=db.scalars(select(ChargeAdjustment).where(ChargeAdjustment.batch_id==batch.id).order_by(ChargeAdjustment.version)).all()
    for charge in db.scalars(query.order_by(Charge.id)):
        key = (charge.booking_id, charge.payer_participant_id)
        if key not in rows:
            person = names[charge.participant_id]
            rows[key] = dict(booking_id=charge.booking_id, payer_participant_id=charge.payer_participant_id,
                name=person['payer_name'], amount=0, received=0, refunded=0, net=0, people=[], movements=[])
        changes=[a for a in adjustments if a.charge_id==charge.id]
        current=charge.amount+sum(a.amount for a in changes)
        row = rows[key]; row['amount'] += current
        row['people'].append(dict(name=names[charge.participant_id]['name'], amount=current,charge_id=charge.id,
                                 original_amount=charge.amount,adjustments=changes,
                                 explanation=names[charge.participant_id]['explanation']))
    movements = select(MoneyMovement).where(MoneyMovement.session_id == game.id).order_by(MoneyMovement.id)
    if booking_id is not None:
        movements = movements.where(MoneyMovement.booking_id == booking_id)
    for entry in db.scalars(movements):
        key = (entry.booking_id, entry.payer_participant_id)
        if key not in rows:
            # Opening legacy money from a cancelled booking is retained as refundable credit.
            booking = db.get(Booking, entry.booking_id)
            rows[key] = dict(booking_id=booking.id, payer_participant_id=None,
                name=next((a['name'] for a in snapshot.get('advances',[]) if a['booking_id']==booking.id),db.get(Member, booking.member_id).name),
                amount=0, received=0, refunded=0, net=0, people=[], movements=[])
        row = rows[key]; row['net'] += entry.amount; row['movements'].append(entry)
        if entry.kind == 'RECEIVED': row['received'] += entry.amount
        elif entry.kind == 'REFUND_RECORDED': row['refunded'] -= entry.amount
        elif entry.kind == 'REVERSAL':
            original=db.get(MoneyMovement,entry.reverses_id)
            if original.kind=='RECEIVED':row['received']+=entry.amount
            elif original.kind=='REFUND_RECORDED':row['refunded']-=entry.amount
    for row in rows.values():
        row['outstanding'] = max(0, row['amount'] - row['net'])
        row['credit'] = max(0, row['net'] - row['amount'])
        row['status'] = ('Thừa / cần hoàn' if row['credit'] else 'Đã thu đủ' if not row['outstanding'] else
                         'Đã thu một phần' if row['net'] else 'Chưa thu')
    return list(rows.values())


def summary(rows):
    return {name: sum(row[name] for row in rows) for name in ('amount', 'received', 'refunded', 'net', 'outstanding', 'credit')}


def sync_legacy(db, game, booking):
    rows = balances(db, game, booking.id)
    booking.paid = bool(rows) and all(not row['outstanding'] for row in rows)
    booking.payment_status = ('confirmed' if booking.paid else 'partial' if any(row['net'] for row in rows) else 'unpaid')


def issue(db, game, host_id, expected):
    existing = batch_for(db, game)
    if existing:
        return existing  # Session lock + unique constraint prevent duplicate batches on retry.
    require_draft(game, db)
    if game.lifecycle_status != 'PLAY_FINISHED':
        raise HTTPException(409, 'Kết thúc đánh và kiểm tra điểm danh trước khi phát hành tiền cần đóng')
    value = draft(db, game)
    if value['unmarked']:
        raise HTTPException(409, 'Cần điểm danh có mặt/vắng cho tất cả người đã được nhận')
    if expected != fingerprint(value):
        raise HTTPException(409, 'Chi phí hoặc điểm danh đã thay đổi. Xem lại bản nháp trước khi phát hành.')
    batch = ChargeBatch(session_id=game.id, snapshot=encode(value), issued_by=host_id)
    db.add(batch); db.flush()
    for person in value['people']:
        db.add(Charge(batch_id=batch.id, booking_id=person['booking_id'], participant_id=person['participant_id'],
            payer_participant_id=person['payer_participant_id'], amount=person['amount'], detail=encode(person)))
    # Import only explicit legacy receipts once, with their original amount, never inferred from proofs.
    for advance in value['advances']:
        booking=db.get(Booking,advance['booking_id'])
        if booking.payer_mode != 'GROUP':
            raise HTTPException(409, 'Khoản đã thu trước phát hành cần giữ một người trả nhóm để đối soát số dư')
        opening=advance['amount']
        if opening:
            db.add(MoneyMovement(session_id=game.id, booking_id=booking.id, amount=opening,
                kind='RECEIVED', source='OTHER', reason='Số dư đã thu legacy trước phát hành; chưa có giờ giao dịch gốc',
                confirmed_by=host_id, request_key=f'legacy-opening-{booking.id}'))
    game.attendance_locked = True
    log_change(db, game.club_id, host_id, 'Phát hành tiền cần đóng', None, dict(batch_id=batch.id, snapshot=value))
    db.flush()
    for booking in db.scalars(select(Booking).where(Booking.session_id == game.id)):
        sync_legacy(db, game, booking)
    return batch


def record_money(db, game, booking, host_id, *, amount, kind, source, request_key,
                 payer_participant_id=None, reason='', reference='', occurred_at=None, proof_id=None, reverses_id=None):
    if not batch_for(db, game):
        raise HTTPException(409, 'Cần phát hành tiền cần đóng trước khi ghi nhận khoản thu mới')
    if not 8 <= len(request_key) <= 128 or len(reason) > 500 or len(reference) > 150:
        raise HTTPException(400, 'Thông tin giao dịch không hợp lệ')
    if kind not in ('RECEIVED', 'REFUND_RECORDED', 'REVERSAL') or source not in ('CASH', 'BANK_TRANSFER', 'OTHER'):
        raise HTTPException(400, 'Loại giao dịch hoặc kênh tiền không hợp lệ')
    value = money(amount)
    if not value: raise HTTPException(400, 'Số tiền phải lớn hơn 0')
    if kind != 'RECEIVED' and not reason.strip(): raise HTTPException(400, 'Cần lý do hoàn tiền / hoàn tác')
    signed = -value if kind == 'REFUND_RECORDED' else value
    if kind == 'REVERSAL':
        original = db.scalar(select(MoneyMovement).where(MoneyMovement.id == reverses_id,
            MoneyMovement.session_id == game.id, MoneyMovement.booking_id == booking.id))
        if not original or original.kind == 'REVERSAL': raise HTTPException(400, 'Không tìm thấy giao dịch gốc hợp lệ')
        if original.payer_participant_id != payer_participant_id: raise HTTPException(400, 'Người thanh toán không khớp')
        signed = -original.amount
        if value != abs(signed):raise HTTPException(400, 'Hoàn tác phải bằng số tiền giao dịch gốc')
    existing = db.scalar(select(MoneyMovement).where(MoneyMovement.session_id == game.id, MoneyMovement.request_key == request_key))
    if existing:
        if (existing.booking_id, existing.payer_participant_id, existing.amount, existing.kind, existing.source, existing.proof_id, existing.reverses_id) != (
                booking.id, payer_participant_id, signed, kind, source, proof_id, reverses_id):
            raise HTTPException(409, 'Mã thao tác đã dùng cho giao dịch khác. Tải lại trang.')
        return existing
    if reverses_id and db.scalar(select(MoneyMovement.id).where(MoneyMovement.reverses_id == reverses_id)):
        raise HTTPException(409, 'Giao dịch đã được hoàn tác')
    rows = balances(db, game, booking.id)
    row = next((r for r in rows if r['payer_participant_id'] == payer_participant_id), None)
    if not row:raise HTTPException(400, 'Chọn đúng người có nghĩa vụ thanh toán')
    if signed < 0 and row['net'] + signed < 0:raise HTTPException(409, 'Không thể hoàn/hoàn tác quá số thực nhận còn lại')
    if occurred_at:
        try:
            moment = datetime.fromisoformat(occurred_at)
            if moment.tzinfo is None:raise ValueError()
            occurred_at = moment.astimezone(timezone.utc).isoformat()
        except ValueError:raise HTTPException(400, 'Thời điểm giao dịch phải có múi giờ hợp lệ')
    entry = MoneyMovement(session_id=game.id, booking_id=booking.id, payer_participant_id=payer_participant_id,
        amount=signed, kind=kind, source=source, reason=reason.strip(), reference=reference.strip(),
        request_key=request_key, confirmed_by=host_id, proof_id=proof_id, reverses_id=reverses_id,
        **({'occurred_at': occurred_at} if occurred_at else {}))
    db.add(entry); db.flush()
    log_change(db, game.club_id, host_id, 'Ghi nhận tiền thực tế', None,
        dict(id=entry.id, booking_id=booking.id, payer_participant_id=payer_participant_id,
             amount=signed, kind=kind, source=source, proof_id=proof_id, reverses_id=reverses_id), reason)
    sync_legacy(db, game, booking)
    return entry


def close_session(db,game,host_id):
    batch=batch_for(db,game)
    if not batch or game.is_cancelled:raise HTTPException(409,'Cần phát hành cơ sở tính phí trước khi chốt sổ')
    if game.lifecycle_status=='SETTLED':return batch
    if game.lifecycle_status!='PLAY_FINISHED':raise HTTPException(409,'Cần kết thúc đánh trước khi chốt sổ')
    totals=summary(balances(db,game))
    batch.closed_at=datetime.now(timezone.utc).isoformat();game.lifecycle_status='SETTLED';game.is_open=False
    game.attendance_locked=True
    log_change(db,game.club_id,host_id,'Chốt sổ buổi đánh',{'status':'PLAY_FINISHED'},
               {'status':'SETTLED','batch_id':batch.id,'version':batch.version,'totals':totals})
    return batch


def adjust_charge(db,game,host_id,charge_id,amount,version,reason,request_key):
    batch=batch_for(db,game)
    if not batch:raise HTTPException(409,'Chưa phát hành tiền cần đóng')
    if not reason.strip() or len(reason)>500 or not 8<=len(request_key)<=128:
        raise HTTPException(400,'Cần lý do và mã thao tác hợp lệ')
    if not amount or abs(amount)>100_000_000:raise HTTPException(400,'Điều chỉnh phải khác 0 và không quá 100 triệu đồng')
    old=db.scalar(select(ChargeAdjustment).where(ChargeAdjustment.batch_id==batch.id,ChargeAdjustment.request_key==request_key))
    if old:
        if (old.charge_id,old.amount,old.reason)!=(charge_id,amount,reason.strip()):raise HTTPException(409,'Mã thao tác đã dùng')
        return old
    if version!=batch.version:raise HTTPException(409,'Sổ vừa được thay đổi. Xem lại số tiền trước khi điều chỉnh.')
    charge=db.scalar(select(Charge).where(Charge.id==charge_id,Charge.batch_id==batch.id))
    if not charge:raise HTTPException(404)
    prior=db.scalars(select(ChargeAdjustment).where(ChargeAdjustment.charge_id==charge.id)).all()
    before=charge.amount+sum(a.amount for a in prior)
    money(before+amount)
    batch.version+=1
    adjustment=ChargeAdjustment(batch_id=batch.id,charge_id=charge.id,amount=amount,version=batch.version,
        reason=reason.strip(),created_by=host_id,request_key=request_key)
    db.add(adjustment);db.flush()
    log_change(db,game.club_id,host_id,'Điều chỉnh khoản phải thu',{'charge_id':charge.id,'amount':before,'version':version},
        {'amount':before+amount,'version':batch.version,'adjustment_id':adjustment.id},reason.strip())
    sync_legacy(db,game,db.get(Booking,charge.booking_id))
    return adjustment

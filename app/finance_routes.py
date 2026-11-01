"""Manual session billing and reconciliation; no banking API."""
import json
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, Form, HTTPException, Request
from sqlalchemy import select
from app.main import (app, db_session, owned_session, ensure_csrf, require_host, page, redirect,
                      Booking, BookingParticipant, money)
from app.finance_service import (require_draft, draft, fingerprint, issue, batch_for, balances,
                                 summary, record_money,close_session,adjust_charge)
from app.attendance import log_change


def finance_view(db, game):
    batch = batch_for(db, game)
    value = json.loads(batch.snapshot) if batch else draft(db, game)
    rows = balances(db, game) if batch else []
    return dict(batch=batch, calculation=value, draft_hash=fingerprint(value), payers=rows,
                finance_totals=summary(rows), request_key=secrets.token_urlsafe(24))


def scoped_booking(db, game, booking_id):
    booking = db.scalar(select(Booking).where(Booking.id == booking_id, Booking.session_id == game.id))
    if not booking: raise HTTPException(404)
    return booking


def set_payer_mode(db, game, booking, mode, host_id):
    require_draft(game, db)
    if mode not in ('GROUP', 'SPLIT'):raise HTTPException(400, 'Cách thanh toán không hợp lệ')
    if booking.paid and mode != 'GROUP':raise HTTPException(409, 'Đã thu trước phát hành. Giữ người trả cả nhóm để không phân bổ trùng.')
    from app.main import PaymentProof
    if mode=='SPLIT' and booking.payer_mode!='SPLIT' and db.scalar(select(PaymentProof.id).where(PaymentProof.booking_id==booking.id,PaymentProof.status=='reported')):
        raise HTTPException(409,'Đang có biên nhận của nhóm. Đối soát / từ chối trước khi tách người trả.')
    previous = booking.payer_mode; booking.payer_mode = mode
    if previous != mode:log_change(db, game.club_id, host_id, 'Chọn người thanh toán', previous, {'booking_id': booking.id, 'mode': mode})


def register_routes():
    @app.post('/games/{game_id}/billing/close')
    def close(request:Request,game_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);game,_=owned_session(request,db,game_id,lock=True,permission='finance')
        close_session(db,game,require_host(request,db).id);db.commit()
        return redirect(f'/games/{game_id}/billing')

    @app.post('/games/{game_id}/billing/adjustments')
    def adjust(request:Request,game_id:int,charge_id:int=Form(),amount:int=Form(),version:int=Form(),
               reason:str=Form(),request_key:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);game,_=owned_session(request,db,game_id,lock=True,permission='finance')
        adjust_charge(db,game,require_host(request,db).id,charge_id,amount,version,reason,request_key)
        db.commit();return redirect(f'/games/{game_id}/billing')

    @app.get('/games/{game_id}/billing')
    def billing(request: Request, game_id: int, db=Depends(db_session)):
        game, club = owned_session(request, db, game_id, permission='finance')
        return page(request, 'billing.html', host=require_host(request, db), game=game, club=club, **finance_view(db, game))

    @app.post('/games/{game_id}/billing/issue')
    def issue_charges(request: Request, game_id: int, draft_hash: str=Form(), csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, _ = owned_session(request, db, game_id, lock=True, permission='finance')
        issue(db, game, require_host(request, db).id, draft_hash)
        db.commit();return redirect(f'/games/{game_id}/billing')

    @app.post('/games/{game_id}/billing/participants/{person_id}')
    def draft_adjustment(request: Request, game_id: int, person_id: int, csrf: str=Form(),
                         exempt: bool=Form(False), discount: int=Form(0), reason: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, _ = owned_session(request, db, game_id, lock=True, permission='finance')
        require_draft(game, db)
        person = db.scalar(select(BookingParticipant).join(Booking).where(BookingParticipant.id == person_id, Booking.session_id == game.id))
        if not person:raise HTTPException(404)
        if not reason.strip() or len(reason) > 500:raise HTTPException(400, 'Cần lý do miễn/giảm hợp lệ')
        before = dict(exempt=person.charge_exempt, discount=person.fee_discount, reason=person.adjustment_reason)
        person.charge_exempt = exempt; person.fee_discount = money(discount); person.adjustment_reason = reason.strip()
        log_change(db, game.club_id, require_host(request, db).id, 'Miễn giảm bản nháp', before,
            dict(participant_id=person.id, exempt=exempt, discount=person.fee_discount), reason.strip())
        db.commit();return redirect(f'/games/{game_id}/billing')

    @app.post('/games/{game_id}/billing/bookings/{booking_id}/payer')
    def payer(request: Request, game_id: int, booking_id: int, mode: str=Form(), csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, _ = owned_session(request, db, game_id, lock=True, permission='finance')
        set_payer_mode(db, game, scoped_booking(db, game, booking_id), mode, require_host(request, db).id)
        db.commit();return redirect(f'/games/{game_id}/billing')

    @app.post('/attend/{key}/payer')
    def guest_payer(request: Request, key: str, mode: str=Form(), csrf: str=Form(), db=Depends(db_session)):
        from app.payments import participant
        ensure_csrf(request, csrf); booking, game, _, _ = participant(db, key, lock=True, request=request)
        if booking.status != 'confirmed':raise HTTPException(409, 'Chỉ chọn thanh toán cho lượt đã được nhận')
        set_payer_mode(db, game, booking, mode, None)
        db.commit();return redirect(f'/attend/{key}')

    @app.post('/games/{game_id}/billing/bookings/{booking_id}/money')
    def money_entry(request: Request, game_id: int, booking_id: int, amount: int=Form(), kind: str=Form(),
                    source: str=Form(), request_key: str=Form(), payer_participant_id: str=Form(''),
                    reason: str=Form(''), reference: str=Form(''), occurred_at: str=Form(''), reverses_id: str=Form(''),
                    csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, _ = owned_session(request, db, game_id, lock=True, permission='finance')
        booking = scoped_booking(db, game, booking_id)
        try:
            payer_id = int(payer_participant_id) if payer_participant_id else None
            reversal_id = int(reverses_id) if reverses_id else None
            moment = datetime.fromisoformat(occurred_at).replace(tzinfo=ZoneInfo('Asia/Ho_Chi_Minh')).isoformat() if occurred_at else None
        except ValueError:raise HTTPException(400, 'Người trả / thời điểm giao dịch chưa hợp lệ')
        record_money(db, game, booking, require_host(request, db).id, amount=amount, kind=kind, source=source,
            request_key=request_key, payer_participant_id=payer_id, reason=reason, reference=reference,
            occurred_at=moment, reverses_id=reversal_id)
        db.commit();return redirect(f'/games/{game_id}/billing')

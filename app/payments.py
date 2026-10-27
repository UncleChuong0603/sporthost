"""Capability links for participants; private media and manual payment review."""
import secrets
from datetime import datetime

from fastapi import Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.main import (app, Host, Club, Member, GameSession, Booking, MonthlyDue, PaymentProof, StoredAsset,
    ClubAccess, db_session, require_host, owned_club, owned_session, accessible_clubs, ensure_csrf,
    page, redirect, booking_fee, confirm_count, has_space, COOKIE_SECURE, signer)
from app.workspace import audit, now_iso, now_local
from app.storage import sanitize_image,put_image,get_image,delete_image


def can_finance(db,host,club):
    return club.owner_id==host.id or bool(db.scalar(select(ClubAccess.id).where(
        ClubAccess.club_id==club.id,ClubAccess.host_id==host.id,ClubAccess.role=='finance')))


def store_asset(db,upload,club_id,kind):
    data=sanitize_image(upload,limit=(2 if kind=='qr' else 3)*1024*1024)
    key,digest=put_image(data,club_id,kind)
    asset=StoredAsset(club_id=club_id,key=key,kind=kind,sha256=digest,size=len(data))
    db.add(asset);db.flush()
    return asset


def image_response(key):
    try:data=get_image(key)
    except FileNotFoundError:raise HTTPException(404)
    return Response(data,media_type='image/png',headers={'Cache-Control':'private, no-store',
            'X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="image.png"'})


def participant(db,key,*,lock=False):
    if len(key)<24:raise HTTPException(404)
    query=select(Booking).where(Booking.access_key==key)
    booking=db.scalar(query)
    if not booking:raise HTTPException(404)
    query=select(GameSession).where(GameSession.id==booking.session_id)
    if lock:query=query.with_for_update()
    game=db.scalar(query)
    if lock:db.refresh(booking)
    member=db.get(Member,booking.member_id);club=db.get(Club,game.club_id)
    return booking,game,member,club


def promote_waitlist(db,game,exclude_id=None):
    if game.is_cancelled or confirm_count(db,game.id)>=game.capacity:return
    for next_booking in db.scalars(select(Booking).where(Booking.session_id==game.id,Booking.status=='waitlist').order_by(Booking.id).with_for_update()):
        if next_booking.id==exclude_id:continue
        if has_space(db,game,next_booking.gender_at_booking):
            next_booking.status='confirmed';break


def register_routes():
    @app.post('/clubs/{club_id}/payment-settings')
    def payment_settings(request:Request,club_id:int,csrf:str=Form(),bank_name:str=Form(''),
            account_holder:str=Form(''),account_number:str=Form(''),payment_note:str=Form(''),
            qr:UploadFile|None=File(None),db=Depends(db_session)):
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='finance')
        asset=store_asset(db,qr,club_id,'qr') if qr and qr.filename else None
        club.bank_name=bank_name.strip()[:80];club.account_holder=account_holder.strip()[:100]
        club.account_number=account_number.strip()[:40];club.payment_note=payment_note.strip()[:160]
        if asset:club.qr_key=asset.key
        audit(db,club_id,host.id,'Cập nhật thông tin nhận tiền','Ảnh QR được lưu phiên bản mới' if asset else 'Thông tin tài khoản')
        try:db.commit()
        except Exception:
            if asset:delete_image(asset.key)
            raise
        return redirect(f'/clubs/{club_id}/settings#payment')

    @app.post('/clubs/{club_id}/payment-settings/remove-qr')
    def remove_qr(request:Request,club_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='finance')
        club.qr_key=None;audit(db,club_id,host.id,'Gỡ QR cho đăng ký mới');db.commit()
        return redirect(f'/clubs/{club_id}/settings#payment')

    @app.post('/clubs/{club_id}/monthly-prices')
    def monthly_prices(request:Request,club_id:int,monthly_fee:int=Form(),monthly_fee_male:str=Form(''),
                       monthly_fee_female:str=Form(''),csrf:str=Form(),db=Depends(db_session)):
        from app.main import money,optional_money
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='finance')
        club.monthly_fee=money(monthly_fee);club.monthly_fee_male=optional_money(monthly_fee_male);club.monthly_fee_female=optional_money(monthly_fee_female)
        audit(db,club_id,host.id,'Cập nhật mức phí tháng');db.commit()
        return redirect(f'/clubs/{club_id}/settings#monthly')

    @app.get('/clubs/{club_id}/qr')
    def host_qr(request:Request,club_id:int,db=Depends(db_session)):
        host,club=owned_club(request,db,club_id)
        if not club.qr_key:raise HTTPException(404)
        return image_response(club.qr_key)

    @app.get('/attend/{key}')
    def participant_page(request:Request,key:str,db=Depends(db_session)):
        booking,game,member,club=participant(db,key)
        proofs=db.scalars(select(PaymentProof).where(PaymentProof.booking_id==booking.id).order_by(PaymentProof.id.desc())).all()
        response=page(request,'participant.html',booking=booking,game=game,member=member,club=club,
            fee=booking_fee(game,booking,member),proofs=proofs,deadline_passed=bool(game.rsvp_deadline and now_local().strftime('%Y-%m-%dT%H:%M')>game.rsvp_deadline))
        response.headers['Cache-Control']='private, no-store';response.headers['Referrer-Policy']='no-referrer'
        return response

    @app.post('/attend/{key}/rsvp')
    def rsvp(request:Request,key:str,action:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);booking,game,member,club=participant(db,key,lock=True)
        if game.is_cancelled:raise HTTPException(400,'Buổi đánh đã hủy')
        if member.kind!='fixed':raise HTTPException(403)
        if action not in ('yes','no'):raise HTTPException(400)
        if action=='yes':
            if booking.status=='confirmed':return redirect(f'/attend/{key}')
            if game.rsvp_deadline and now_local().strftime('%Y-%m-%dT%H:%M')>game.rsvp_deadline:
                raise HTTPException(400,'Đã qua hạn RSVP; vui lòng liên hệ host')
            booking.status='confirmed' if has_space(db,game,booking.gender_at_booking) else 'waitlist'
        else:
            booking.status='cancelled';promote_waitlist(db,game)
        audit(db,club.id,None,'Member xác nhận lịch',f'Booking #{booking.id}: {booking.status}')
        db.commit();return redirect(f'/attend/{key}')

    @app.post('/attend/{key}/cancel')
    def cancel_participant(request:Request,key:str,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);booking,game,member,club=participant(db,key,lock=True)
        booking.status='cancelled';promote_waitlist(db,game)
        audit(db,club.id,None,'Người chơi hủy tham gia',f'Booking #{booking.id}');db.commit()
        return redirect(f'/attend/{key}')

    @app.get('/attend/{key}/qr')
    def participant_qr(request:Request,key:str,db=Depends(db_session)):
        booking,game,member,club=participant(db,key)
        qr=booking.qr_key or club.qr_key
        if not qr:raise HTTPException(404)
        return image_response(qr)

    @app.post('/attend/{key}/proof')
    def upload_proof(request:Request,key:str,csrf:str=Form(),proof:UploadFile=File(),db=Depends(db_session)):
        from app.security import rate_limit
        rate_limit(request,'proof-upload',limit=15,seconds=300)
        ensure_csrf(request,csrf);booking,game,member,club=participant(db,key,lock=True)
        if game.is_cancelled or booking.status!='confirmed' or booking.paid or booking.payment_status=='refunded':
            raise HTTPException(400,'Chỉ gửi biên nhận cho booking đã xác nhận và chưa thanh toán')
        if db.scalar(select(PaymentProof.id).where(PaymentProof.booking_id==booking.id,PaymentProof.status=='reported')):
            raise HTTPException(409,'Biên nhận đang chờ host đối chiếu')
        asset=store_asset(db,proof,club.id,'proof')
        db.add(PaymentProof(booking_id=booking.id,asset_id=asset.id));booking.payment_status='reported'
        audit(db,club.id,None,'Nhận biên nhận',f'Booking #{booking.id}')
        try:db.commit()
        except Exception:delete_image(asset.key);raise
        return redirect(f'/attend/{key}?reported=1')

    @app.get('/dues/pay/{key}')
    def due_page(request:Request,key:str,db=Depends(db_session)):
        if len(key)<24:raise HTTPException(404)
        due=db.scalar(select(MonthlyDue).where(MonthlyDue.access_key==key))
        if not due:raise HTTPException(404)
        member=db.get(Member,due.member_id);club=db.get(Club,member.club_id)
        response=page(request,'due_payment.html',due=due,member=member,club=club)
        response.headers['Cache-Control']='private, no-store';response.headers['Referrer-Policy']='no-referrer'
        return response

    @app.get('/dues/pay/{key}/qr')
    def due_qr(request:Request,key:str,db=Depends(db_session)):
        if len(key)<24:raise HTTPException(404)
        due=db.scalar(select(MonthlyDue).where(MonthlyDue.access_key==key))
        if not due:raise HTTPException(404)
        club=db.get(Club,db.get(Member,due.member_id).club_id)
        if not (due.qr_key or club.qr_key):raise HTTPException(404)
        return image_response(due.qr_key or club.qr_key)

    @app.post('/dues/pay/{key}/proof')
    def due_proof(request:Request,key:str,csrf:str=Form(),proof:UploadFile=File(),db=Depends(db_session)):
        from app.security import rate_limit
        rate_limit(request,'proof-upload',limit=15,seconds=300)
        ensure_csrf(request,csrf)
        if len(key)<24:raise HTTPException(404)
        due=db.scalar(select(MonthlyDue).where(MonthlyDue.access_key==key).with_for_update())
        if not due:raise HTTPException(404)
        if due.paid or db.scalar(select(PaymentProof.id).where(PaymentProof.due_id==due.id,PaymentProof.status=='reported')):
            raise HTTPException(409,'Khoản thu đã xử lý hoặc đang chờ duyệt')
        club_id=db.get(Member,due.member_id).club_id;asset=store_asset(db,proof,club_id,'proof')
        db.add(PaymentProof(due_id=due.id,asset_id=asset.id));due.payment_status='reported'
        audit(db,club_id,None,'Nhận biên nhận phí tháng',f'Khoản #{due.id}')
        try:db.commit()
        except Exception:delete_image(asset.key);raise
        return redirect(f'/dues/pay/{key}')

    @app.get('/payments/review')
    def review_page(request:Request,club_id:str|None=None,db=Depends(db_session)):
        if club_id in ('',None):club_id=None
        elif str(club_id).isdigit():club_id=int(club_id)
        else:raise HTTPException(400)
        host=require_host(request,db);clubs=[c for c in accessible_clubs(db,host) if can_finance(db,host,c)]
        if club_id and club_id not in {c.id for c in clubs}:raise HTTPException(404)
        ids=[club_id] if club_id else [c.id for c in clubs]
        proofs=db.scalars(select(PaymentProof).join(StoredAsset,StoredAsset.id==PaymentProof.asset_id)
                   .where(StoredAsset.club_id.in_(ids)).order_by(PaymentProof.id.desc()).limit(100)).all()
        rows=[]
        for proof in proofs:
            if proof.booking_id:
                target=db.get(Booking,proof.booking_id);game=db.get(GameSession,target.session_id);member=db.get(Member,target.member_id)
                amount=booking_fee(game,target,member);title=game.title
            else:
                target=db.get(MonthlyDue,proof.due_id);member=db.get(Member,target.member_id);amount=target.amount;title='Phí tháng '+target.period
            rows.append({'proof':proof,'member':member,'title':title,'amount':amount})
        return page(request,'payment_review.html',host=host,clubs=clubs,rows=rows,club_id=club_id)

    @app.get('/proofs/{proof_id}/image')
    def proof_image(request:Request,proof_id:int,db=Depends(db_session)):
        proof=db.get(PaymentProof,proof_id)
        if not proof:raise HTTPException(404)
        asset=db.get(StoredAsset,proof.asset_id);owned_club(request,db,asset.club_id,permission='finance')
        if asset.size==0:raise HTTPException(410,'Ảnh biên nhận đã hết thời hạn lưu trữ')
        return image_response(asset.key)

    @app.post('/proofs/{proof_id}/review')
    def review_proof(request:Request,proof_id:int,action:str=Form(),note:str=Form(''),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);proof=db.get(PaymentProof,proof_id)
        if not proof:raise HTTPException(404)
        asset=db.get(StoredAsset,proof.asset_id);host,club=owned_club(request,db,asset.club_id,permission='finance')
        if action not in ('confirm','reject'):raise HTTPException(400)
        target_model=Booking if proof.booking_id else MonthlyDue;target_id=proof.booking_id or proof.due_id
        target=db.scalar(select(target_model).where(target_model.id==target_id).with_for_update())
        db.refresh(proof)
        if proof.status!='reported' or target.paid:raise HTTPException(409,'Biên nhận này đã được xử lý')
        proof.status='confirmed' if action=='confirm' else 'rejected';proof.reviewed_by=host.id
        proof.reviewed_at=now_iso();proof.note=note.strip()[:300]
        target.payment_status=proof.status;target.paid=action=='confirm'
        audit(db,club.id,host.id,'Đối soát biên nhận',f'Biên nhận #{proof.id}: {proof.status}');db.commit()
        return redirect(f'/payments/review?club_id={club.id}')

"""Guest group editing and host capability lifecycle, scoped through the session."""
from fastapi import Depends, Form, HTTPException, Request
from app.main import app, db_session, owned_session, require_host, ensure_csrf, redirect, Booking
from app.booking_service import ensure_token, allow_guest_change, parse_party, set_party, can_fit
from app.workspace import audit


def register_routes():
    @app.post('/attend/{key}/edit')
    async def edit_party(request: Request, key: str, db=Depends(db_session)):
        from app.payments import participant
        form = await request.form(); ensure_csrf(request, form.get('csrf', ''))
        booking, game, member, club = participant(db, key, lock=True, request=request)
        allow_guest_change(db, booking, game)
        if booking.status in ('cancelled', 'rejected', 'invited') or member.kind != 'guest':
            raise HTTPException(400, 'Đăng ký này không thể tự sửa. Vui lòng liên hệ host.')
        party = parse_party(form, game, member)
        fits = can_fit(db, game, [person['gender'] for person in party], exclude_id=booking.id)
        if not fits and booking.status == 'confirmed':
            raise HTTPException(409, 'Không đủ chỗ cho cả nhóm. Đăng ký hiện tại được giữ nguyên; hãy liên hệ host.')
        previous_size = booking.party_size
        previous_status = booking.status
        previous_people = [(person.name,person.gender,person.level) for person in booking.participants]
        set_party(db, booking, party)
        if len(party) > previous_size:
            booking.status = ('confirmed' if fits else 'waitlist') if game.approval_mode == 'AUTO_APPROVE' else ('pending' if fits else 'waitlist')
        elif booking.status == 'waitlist':
            booking.status = 'waitlist'
        import json
        from app.main import AuditLog
        db.add(AuditLog(club_id=club.id,action='Sửa nhóm đăng ký',details=json.dumps({
            'booking_id':booking.id,'before':previous_people,'after':[(p['name'],p['gender'],p['level']) for p in party],
            'previous_status':previous_status,'status':booking.status},ensure_ascii=False)))
        db.flush()
        if previous_status == 'confirmed' and (len(party) < previous_size or booking.status != 'confirmed'):
            from app.payments import promote_waitlist
            promote_waitlist(db, game, exclude_id=booking.id)
        db.commit()
        return redirect(f'/attend/{key}?updated=1')

    @app.post('/games/{game_id}/bookings/{booking_id}/private-link/rotate')
    def rotate_link(request: Request, game_id: int, booking_id: int, csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True, permission="manage_bookings")
        booking = db.get(Booking, booking_id)
        if not booking or booking.session_id != game.id:
            raise HTTPException(404)
        booking.token_nonce = ''; booking.token_expires_at = None
        booking._legacy_access_key = ''
        booking.legacy_token_digest = None; booking.token_revoked = False
        ensure_token(booking, game)
        audit(db, club.id, require_host(request, db).id, 'Cấp lại liên kết riêng', f'Đăng ký #{booking.id}; liên kết cũ bị thu hồi')
        db.commit(); return redirect(f'/games/{game_id}')

    @app.post('/games/{game_id}/bookings/{booking_id}/private-link/revoke')
    def revoke_link(request: Request, game_id: int, booking_id: int, csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True, permission="manage_bookings")
        booking = db.get(Booking, booking_id)
        if not booking or booking.session_id != game.id:
            raise HTTPException(404)
        booking.token_revoked = True
        audit(db, club.id, require_host(request, db).id, 'Thu hồi liên kết riêng', f'Đăng ký #{booking.id}')
        db.commit(); return redirect(f'/games/{game_id}')

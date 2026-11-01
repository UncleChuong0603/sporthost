"""Host operations at the court. Serialize under the session row and audit changes."""
import json
from datetime import datetime, timezone

from fastapi import Depends, Form, HTTPException, Request
from sqlalchemy import select

from app.main import (app, Booking, BookingParticipant, Member, GameSession, AuditLog,
    db_session, owned_session, require_host, ensure_csrf, redirect, digits_phone,
    validated_gender, member_by_phone, member_fee)
from app.booking_service import can_fit

STATUS_LABELS = {'DRAFT': 'Bản nháp', 'OPEN': 'Mở đăng ký', 'IN_PROGRESS': 'Đang đánh',
                 'PLAY_FINISHED': 'Kết thúc đánh', 'SETTLED': 'Đã chốt sổ', 'CANCELLED': 'Đã hủy'}
ATTENDANCE_LABELS = {'NOT_MARKED': 'Chưa điểm danh', 'CHECKED_IN': 'Có mặt', 'NO_SHOW': 'Vắng mặt'}


def mutable_attendance(game):
    if game.is_cancelled or game.lifecycle_status in ('CANCELLED', 'SETTLED') or game.attendance_locked:
        raise HTTPException(409, 'Điểm danh đã khóa. Cần điều chỉnh có lý do và đối soát trước khi sửa.')


def log_change(db, club_id, host_id, action, before, after, reason=''):
    db.add(AuditLog(club_id=club_id, host_id=host_id, action=action,
                   details=json.dumps({'before': before, 'after': after, 'reason': reason}, ensure_ascii=False)))


def attendance_snapshot(person):
    return {name: getattr(person, name) for name in
            ('id', 'name', 'attendance_status', 'arrived_at', 'left_at', 'attendance_version')}


def mark(db, game, booking, person, action, host_id, version, reason=''):
    mutable_attendance(game)
    if booking.status != 'confirmed':
        raise HTTPException(409, 'Chỉ điểm danh người đã được nhận vào buổi đánh')
    if action not in ('check_in', 'no_show', 'check_out', 'reset'):
        raise HTTPException(400, 'Thao tác điểm danh không hợp lệ')
    desired = {'check_in': 'CHECKED_IN', 'no_show': 'NO_SHOW', 'reset': 'NOT_MARKED'}.get(action)
    if (action == 'check_out' and person.left_at) or (desired == person.attendance_status and (action != 'check_in' or not person.left_at)):
        return  # Retry of the same operation has no side effects.
    if version != person.attendance_version:
        raise HTTPException(409, 'Điểm danh vừa được host khác cập nhật. Tải lại trang trước khi sửa.')
    if person.attendance_status == 'NO_SHOW' and action in ('check_in', 'reset') and not can_fit(db, game, [person.gender]):
        raise HTTPException(409, 'Chỗ đã được nhận bởi người khác. Kiểm tra lại sức chứa trước khi nhận người này.')
    before = attendance_snapshot(person)
    now = datetime.now(timezone.utc).isoformat()
    if action == 'check_out':
        if person.attendance_status != 'CHECKED_IN':
            raise HTTPException(400, 'Cần điểm danh có mặt trước khi ghi nhận về sớm')
        person.left_at = now
    elif action == 'check_in':
        person.attendance_status = 'CHECKED_IN'; person.arrived_at = person.arrived_at or now; person.left_at = None
    else:
        if person.attendance_status == 'CHECKED_IN' and not reason:
            raise HTTPException(400, 'Vui lòng ghi lý do khi hoàn tác người đã có mặt')
        person.attendance_status = desired; person.arrived_at = None; person.left_at = None
    person.attendance_actor_id = host_id; person.attendance_version += 1
    # Legacy summary is compatibility only; per-person records are the source of truth.
    booking.attended = all(p.attendance_status == 'CHECKED_IN' for p in booking.participants)
    log_change(db, game.club_id, host_id, 'Điểm danh người chơi', before, attendance_snapshot(person), reason)


def register_routes():
    @app.post('/games/{game_id}/lifecycle/{action}')
    def transition(request: Request, game_id: int, action: str, csrf: str=Form(), reason: str=Form(''), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True)
        mutable_attendance(game)
        actions = {'start': ('OPEN', 'IN_PROGRESS'), 'finish': ('IN_PROGRESS', 'PLAY_FINISHED'),
                   'reopen': ('PLAY_FINISHED', 'IN_PROGRESS')}
        if action not in actions:
            raise HTTPException(400, 'Thao tác buổi đánh không hợp lệ')
        before, after = actions[action]
        if game.lifecycle_status == after:
            return redirect(f'/games/{game_id}#attendance')
        if game.lifecycle_status != before:
            raise HTTPException(409, 'Trạng thái buổi đánh không phù hợp với thao tác này')
        if action == 'reopen' and not reason.strip():
            raise HTTPException(400, 'Vui lòng ghi lý do mở lại buổi đánh')
        if len(reason) > 500:raise HTTPException(400, 'Lý do quá dài')
        game.lifecycle_status = after; game.is_open = False
        log_change(db, club.id, require_host(request, db).id, 'Đổi trạng thái buổi đánh', before, after, reason.strip())
        db.commit(); return redirect(f'/games/{game_id}#attendance')

    @app.post('/games/{game_id}/participants/{person_id}/attendance')
    def attendance(request: Request, game_id: int, person_id: int, action: str=Form(),
                   version: int=Form(), csrf: str=Form(), reason: str=Form(''), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True,permission="check_in")
        person = db.scalar(select(BookingParticipant).join(Booking).where(
            BookingParticipant.id == person_id, Booking.session_id == game.id))
        if not person:raise HTTPException(404)
        if len(reason)>500:raise HTTPException(400, 'Lý do quá dài')
        mark(db, game, person.booking, person, action, require_host(request, db).id, version, reason.strip())
        db.commit(); return redirect(f'/games/{game_id}#attendance')

    @app.post('/games/{game_id}/participants/{person_id}/replace')
    def replace_person(request: Request, game_id: int, person_id: int, name: str=Form(),
                       gender: str=Form('unspecified'), level: str=Form(''), reason: str=Form(),
                       version: int=Form(), csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True,permission="manage_bookings")
        mutable_attendance(game)
        person = db.scalar(select(BookingParticipant).join(Booking).where(
            BookingParticipant.id == person_id, Booking.session_id == game.id))
        if not person:raise HTTPException(404)
        booking = person.booking
        if booking.status != 'confirmed':raise HTTPException(409, 'Cần duyệt đăng ký trước khi thay người')
        if not name.strip() or len(name.strip())>100 or not reason.strip() or len(reason)>500 or len(level)>40:
            raise HTTPException(400, 'Điền tên, trình độ hợp lệ và lý do thay người')
        if version != person.attendance_version:raise HTTPException(409, 'Thông tin vừa thay đổi. Vui lòng tải lại trang')
        gender = validated_gender(gender)
        proposed = [gender if p.id == person.id else p.gender for p in booking.participants if p.id==person.id or p.attendance_status != 'NO_SHOW']
        if not can_fit(db, game, proposed, exclude_id=booking.id):raise HTTPException(409, 'Thay người vượt giới hạn chỗ/giới tính')
        before = attendance_snapshot(person)
        person.name = name.strip(); person.gender = gender; person.level = level.strip(); person.member_id = None
        person.attendance_status = 'NOT_MARKED'; person.arrived_at = None; person.left_at = None
        person.attendance_actor_id = require_host(request, db).id; person.attendance_version += 1
        booking.attended = False
        log_change(db, club.id, person.attendance_actor_id, 'Thay người tham gia', before, attendance_snapshot(person), reason.strip())
        db.commit(); return redirect(f'/games/{game_id}#attendance')

    @app.post('/games/{game_id}/walk-ins')
    def walk_in(request: Request, game_id: int, name: str=Form(), phone: str=Form(),
                gender: str=Form('unspecified'), level: str=Form(''), csrf: str=Form(), db=Depends(db_session)):
        ensure_csrf(request, csrf); game, club = owned_session(request, db, game_id, lock=True,permission="manage_bookings")
        from app.main import owned_club
        owned_club(request,db,club.id,permission='check_in')
        mutable_attendance(game)
        if game.lifecycle_status not in ('OPEN','IN_PROGRESS'):raise HTTPException(409, 'Buổi đã kết thúc. Mở lại có lý do trước khi thêm người')
        if not name.strip() or len(name.strip())>100 or len(level)>40:raise HTTPException(400, 'Thông tin người đến sân không hợp lệ')
        phone=digits_phone(phone); gender=validated_gender(gender)
        member=member_by_phone(db,club.id,phone)
        booking=db.scalar(select(Booking).where(Booking.session_id==game.id,Booking.member_id==member.id)) if member else None
        if booking:
            if booking.status!='confirmed':raise HTTPException(409, 'Người này đã có lượt đăng ký. Hãy duyệt lượt hiện có để giữ nguyên nhóm')
            return redirect(f'/games/{game_id}#attendance')
        if not can_fit(db,game,[member.gender if member else gender]):raise HTTPException(409, 'Buổi đã đủ chỗ. Cần xác nhận vắng mặt hoặc kiểm tra sức chứa trước')
        if not member:
            member=Member(club_id=club.id,name=name.strip(),phone=phone,gender=gender,kind='guest',level=level.strip())
            db.add(member);db.flush()
        booking=Booking(session_id=game.id,member_id=member.id,status='confirmed',channel='manual',
                        gender_at_booking=member.gender,fee_amount=member_fee(game,member),qr_key=club.qr_key)
        db.add(booking);db.flush()
        mark(db,game,booking,booking.participants[0],'check_in',require_host(request,db).id,0)
        log_change(db,club.id,require_host(request,db).id,'Thêm người đến trực tiếp',None,{'booking_id':booking.id,'name':member.name})
        db.commit();return redirect(f'/games/{game_id}#attendance')

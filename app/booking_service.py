"""Session policies, whole-group capacity and private guest capabilities.

All seat-changing callers must lock GameSession first, then Booking/participants.
The session row is the shared PostgreSQL serialization point, including cancellations.
"""
import hashlib
import hmac
import secrets
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import event, select, func
from sqlalchemy.orm import Session

from app.main import Booking, BookingParticipant, Member, GameSession, SECRET_KEY, member_fee
from app.workspace import now_local


def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def raw_token(nonce):
    # Random nonce + server-only HMAC: database contents cannot reconstruct links.
    return hmac.new(SECRET_KEY.encode(), ('guest-booking-v2|' + nonce).encode(), hashlib.sha256).hexdigest()


def ensure_token(booking, game=None):
    if not booking.token_nonce:
        booking.token_nonce = secrets.token_urlsafe(32)
        booking.token_digest = digest(raw_token(booking.token_nonce))
    if not booking.token_expires_at:
        base = datetime.now(timezone.utc)
        if game:
            start = datetime.fromisoformat(game.starts_at).replace(tzinfo=now_local().tzinfo).astimezone(timezone.utc)
            base = max(base, start)
        booking.token_expires_at = (base + timedelta(days=180)).isoformat()


def booked_policy(booking, game):
    policy = json.loads(booking.policy_snapshot or '{}')
    return policy or {'cancellation_deadline': game.cancellation_deadline or game.starts_at,
                      'cancellation_policy': game.cancellation_policy, 'fee_mode': game.fee_mode,
                      'no_show_policy': game.no_show_policy, 'monthly_policy': game.monthly_policy}


def token_valid(booking, raw):
    if booking.token_revoked or not booking.token_expires_at:
        return False
    if datetime.fromisoformat(booking.token_expires_at) <= datetime.now(timezone.utc):
        return False
    value = digest(raw)
    return any(hmac.compare_digest(value, candidate) for candidate in
               (booking.token_digest, booking.legacy_token_digest) if candidate)


@event.listens_for(Session, 'before_flush')
def initialize_booking(db, flush_context, instances):
    # Covers guest registration, host fixed members, recurring invitations and old clients.
    for booking in list(db.new):
        if not isinstance(booking, Booking):
            continue
        game = db.get(GameSession, booking.session_id)
        member = db.get(Member, booking.member_id)
        ensure_token(booking, game)
        if game and (not booking.policy_snapshot or booking.policy_snapshot == '{}'):
            booking.policy_snapshot = json.dumps(booked_policy(booking, game), ensure_ascii=False)
        if not booking.participants and member and game:
            fee = booking.fee_amount if booking.fee_amount is not None else member_fee(game, member)
            booking.participants.append(BookingParticipant(position=0, member_id=member.id,
                name=member.name, gender=booking.gender_at_booking or member.gender, level=member.level, fee_amount=fee))


def can_fit(db, game, genders, exclude_id=None):
    gender_column = func.coalesce(BookingParticipant.gender, Booking.gender_at_booking)
    query = select(gender_column, func.count()).select_from(Booking).outerjoin(BookingParticipant).where(
        Booking.session_id == game.id, Booking.status == 'confirmed',
        (BookingParticipant.id.is_(None) | (BookingParticipant.attendance_status != 'NO_SHOW')))
    if exclude_id is not None:
        query = query.where(Booking.id != exclude_id)
    counts = dict(db.execute(query.group_by(gender_column)).all())
    if sum(counts.values()) + len(genders) > game.capacity:
        return False
    if 'unspecified' in genders and (game.capacity_male is not None or game.capacity_female is not None):
        return False
    for gender in ('male', 'female'):
        quota = getattr(game, 'capacity_' + gender)
        if quota is not None and counts.get(gender, 0) + genders.count(gender) > quota:
            return False
    return True


def registration_open(game):
    if not game.is_open or game.is_cancelled or game.lifecycle_status!='OPEN':
        return False
    now = now_local().strftime('%Y-%m-%dT%H:%M')
    deadline = game.registration_deadline or game.starts_at
    return now < deadline


def allow_guest_change(db, booking, game, *, editing=True):
    if game.attendance_locked or game.lifecycle_status in ('PLAY_FINISHED','SETTLED'):
        raise HTTPException(409, 'Buổi đã kết thúc hoặc đã phát hành tiền. Liên hệ host để điều chỉnh.')
    now = now_local().strftime('%Y-%m-%dT%H:%M')
    if game.is_cancelled or now >= booked_policy(booking, game)['cancellation_deadline']:
        raise HTTPException(400, 'Đã qua hạn thay đổi đăng ký. Vui lòng liên hệ host.')
    from app.main import PaymentProof
    if booking.attended or any(p.attendance_status!='NOT_MARKED' for p in booking.participants) or (editing and (booking.paid or db.scalar(select(PaymentProof.id).where(PaymentProof.booking_id == booking.id)))):
        raise HTTPException(409, 'Đăng ký đã có điểm danh hoặc giao dịch. Liên hệ host để điều chỉnh có đối soát.')


def session_policy(club, form=None):
    form = form or {}
    values = dict(approval_mode=club.default_approval_mode, sport_snapshot=club.sport_type,
                  skill_guidance=club.skill_guidance, venue_instructions=club.venue_instructions,
                  cancellation_policy=club.cancellation_policy)
    choices = {'fee_mode': (('FIXED_PRICE', 'COST_SHARING'), club.default_fee_mode),
               'no_show_policy': (('FREE', 'FULL'), 'FREE'),
               'monthly_policy': (('EXEMPT_PAID', 'SESSION_FEE'), 'EXEMPT_PAID')}
    for name, (allowed, default) in choices.items():
        value = str(form.get(name, '') or default)
        if value not in allowed:raise HTTPException(400, 'Chính sách tính phí không hợp lệ')
        values[name] = value
    limits = {'skill_guidance': 500, 'venue_instructions': 2000, 'cancellation_policy': 2000,
              'participation_conditions': 2000, 'maps_url': 500}
    for name, maximum in limits.items():
        if name in form:
            value = str(form[name]).strip()
            if len(value) > maximum:
                raise HTTPException(400, 'Thông tin chính sách hoặc địa điểm quá dài')
            values[name] = value
    if 'approval_mode' in form and form['approval_mode']:
        if form['approval_mode'] not in ('AUTO_APPROVE', 'MANUAL_APPROVE'):
            raise HTTPException(400, 'Cách duyệt đăng ký không hợp lệ')
        values['approval_mode'] = form['approval_mode']
    if values.get('maps_url'):
        url = urlsplit(values['maps_url'])
        if url.scheme != 'https' or url.username or url.password or url.hostname not in (
                'maps.google.com', 'www.google.com', 'google.com', 'maps.app.goo.gl', 'goo.gl'):
            raise HTTPException(400, 'Vui lòng dùng liên kết Google Maps HTTPS hợp lệ')
    for name in ('registration_deadline', 'cancellation_deadline'):
        if name in form:
            raw = str(form[name]).strip()
            try:
                values[name] = datetime.strptime(raw, '%Y-%m-%dT%H:%M').strftime('%Y-%m-%dT%H:%M') if raw else None
            except ValueError:
                raise HTTPException(400, 'Hạn đăng ký hoặc hạn hủy không hợp lệ')
            if values[name] and form.get('starts_at') and values[name] > form['starts_at']:
                raise HTTPException(400, 'Hạn đăng ký/hủy không được sau giờ bắt đầu')
    return values


def parse_party(form, game, member):
    names = form.getlist('companion_name') if hasattr(form, 'getlist') else form.get('companion_name', [])
    genders = form.getlist('companion_gender') if hasattr(form, 'getlist') else form.get('companion_gender', [])
    levels = form.getlist('companion_level') if hasattr(form, 'getlist') else form.get('companion_level', [])
    if max(len(names), len(genders), len(levels)) > 19 or len(genders)>len(names) or len(levels)>len(names):
        raise HTTPException(400, 'Mỗi lượt đăng ký tối đa 20 người')
    party = [dict(position=0, member_id=member.id, name=member.name, gender=member.gender,
                  level=member.level, fee_amount=member_fee(game, member))]
    for index, raw in enumerate(names):
        name = str(raw).strip()
        if not name:
            continue
        gender = str(genders[index]) if index < len(genders) else 'unspecified'
        level = str(levels[index]).strip() if index < len(levels) else ''
        if len(name) > 100 or len(level) > 40 or gender not in ('male', 'female', 'unspecified'):
            raise HTTPException(400, 'Thông tin người đi cùng không hợp lệ')
        guest = Member(kind='guest', gender=gender)
        party.append(dict(position=len(party), member_id=None, name=name, gender=gender,
                          level=level, fee_amount=member_fee(game, guest)))
    if len(party) > game.capacity:
        raise HTTPException(400, 'Số người trong nhóm vượt giới hạn của buổi đánh')
    return party


def set_party(db, booking, party):
    # Free unique (booking_id, position) before inserting replacement rows.
    booking.participants.clear()
    db.flush()
    booking.participants = [BookingParticipant(**person) for person in party]
    booking.fee_amount = sum(person['fee_amount'] for person in party)

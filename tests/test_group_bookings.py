import re
import secrets
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.main import app, SessionLocal, Booking, BookingParticipant, GameSession, Member, confirm_count
from app.booking_service import digest
from app.workspace import now_local


def csrf(response):
    return re.search(r'name="csrf" value="([^"]+)"', response.text).group(1)


def post(client, path, data, source):
    source_page = client.get(source)
    if 'name="csrf"' not in source_page.text:
        source_page = client.get('/signup')
    return client.post(path, data={**data, 'csrf': csrf(source_page)}, follow_redirects=True)


@pytest.fixture
def context():
    with TestClient(app) as host, TestClient(app) as guest:
        post(host, '/signup', {'email': f'group-{secrets.token_hex(8)}@example.com', 'password': 'group-test-password'}, '/signup')
        response = post(host, '/clubs', {'name': 'CLB nhóm', 'skill_guidance': 'Trung bình',
                        'cancellation_policy': 'Báo host trước giờ đánh', 'venue_instructions': 'Cổng sau'}, '/clubs')
        club = int(response.url.path.split('/')[-1])
        yield host, guest, club


def game(context, capacity=6, mode='MANUAL_APPROVE', **policy):
    host, guest, club = context
    starts = (now_local() + timedelta(days=7)).strftime('%Y-%m-%dT19:00')
    response = post(host, f'/clubs/{club}/games', {'title': 'Buổi đánh nhóm', 'starts_at': starts,
                    'capacity': capacity, 'guest_fee': 70000, 'approval_mode': mode, **policy}, f'/clubs/{club}')
    assert response.status_code == 200
    game_id = int(response.url.path.split('/')[-1])
    with SessionLocal() as db:
        public = '/join/' + db.get(GameSession, game_id).public_id
    return game_id, public


def register(guest, public, size, phone='0902345678'):
    return post(guest, public, {'name': 'Người liên hệ', 'phone': phone, 'gender': 'unspecified',
                'companion_name': [f'Bạn {index}' for index in range(size - 1)]}, public)


def booking(game_id, phone='0902345678'):
    with SessionLocal() as db:
        return db.scalar(select(Booking).join(Member).where(Booking.session_id == game_id, Member.phone == phone))


def test_manual_whole_group_capacity_and_payment_total(context):
    host, guest, club = context
    game_id, public = game(context, capacity=4)
    response = register(guest, public, 3)
    assert 'Chưa phải xác nhận giữ chỗ' in response.text
    first = booking(game_id)
    assert first.status == 'pending' and first.party_size == 3 and first.fee_amount == 210000
    with SessionLocal() as db:
        assert confirm_count(db, game_id) == 0
        assert db.scalar(text('SELECT access_key FROM bookings WHERE id=:id'), {'id': first.id}) == ''
        assert first.token_digest == digest(first.access_key)
    path = f'/games/{game_id}'
    assert post(host, f'{path}/bookings/{first.id}/approve', {}, path).status_code == 200
    assert '3/4' in host.get(path).text
    assert '210.000đ' in host.get(path).text
    response = register(guest, public, 2, '0902345679')
    second = booking(game_id, '0902345679')
    assert second.status == 'waitlist'
    assert 'danh sách chờ' in response.text
    post(host, f'{path}/bookings/{second.id}/approve', {}, path)
    assert booking(game_id, '0902345679').status == 'waitlist'
    assert 'Bạn 0' in host.get(path).text
    public_page = TestClient(app).get(public).text
    assert '0902345678' not in public_page and 'Bạn 0' not in public_page and first.access_key not in public_page


def test_auto_approval_waitlist_and_group_cancellation_promote_atomically(context):
    host, guest, club = context
    game_id, public = game(context, capacity=3, mode='AUTO_APPROVE')
    response = register(guest, public, 2)
    assert 'Đã giữ chỗ cho cả nhóm' in response.text
    first = booking(game_id)
    register(guest, public, 2, '0902345679')
    assert booking(game_id, '0902345679').status == 'waitlist'
    link = '/attend/' + first.access_key
    assert post(guest, link + '/cancel', {}, link).status_code == 200
    assert booking(game_id, '0902345679').status == 'confirmed'
    assert post(guest, link + '/cancel', {}, link).status_code == 200
    with SessionLocal() as db:
        assert confirm_count(db, game_id) == 2


def test_edit_growth_requires_capacity_and_manual_reapproval(context):
    host, guest, club = context
    game_id, public = game(context, capacity=3)
    register(guest, public, 2)
    first = booking(game_id)
    path = f'/games/{game_id}'
    post(host, f'{path}/bookings/{first.id}/approve', {}, path)
    register(guest, public, 1, '0902345679')
    second = booking(game_id, '0902345679')
    post(host, f'{path}/bookings/{second.id}/approve', {}, path)
    link = '/attend/' + first.access_key
    response = post(guest, link + '/edit', {'companion_name': ['Một', 'Hai']}, link)
    assert response.status_code == 409
    assert booking(game_id).party_size == 2 and booking(game_id).status == 'confirmed'
    post(host, f'{path}/bookings/{second.id}/cancel', {}, path)
    response = post(guest, link + '/edit', {'companion_name': ['Một', 'Hai']}, link)
    assert response.status_code == 200
    assert booking(game_id).party_size == 3 and booking(game_id).status == 'pending'
    post(host, f'{path}/bookings/{first.id}/approve', {}, path)
    assert booking(game_id).status == 'confirmed'
    # Removing companions retains the approved lead and does not duplicate rows or fees.
    assert post(guest, link + '/edit', {}, link).status_code == 200
    assert booking(game_id).party_size == 1 and booking(game_id).fee_amount == 70000


def test_tokens_legacy_hash_rotation_expiry_revoke_and_cross_club(context):
    host, guest, club = context
    game_id, public = game(context)
    register(guest, public, 1)
    record = booking(game_id)
    original = record.access_key
    legacy = secrets.token_urlsafe(24)
    with SessionLocal.begin() as db:
        db.get(Booking, record.id).legacy_token_digest = digest(legacy)
        db.get(Booking, record.id)._legacy_access_key = legacy
    assert guest.get('/attend/' + legacy).status_code == 200
    with SessionLocal.begin() as db:
        db.get(Booking, record.id)._legacy_access_key = legacy
    path = f'/games/{game_id}'
    assert post(host, f'{path}/bookings/{record.id}/private-link/rotate', {}, path).status_code == 200
    fresh = booking(game_id).access_key
    assert fresh != original
    assert guest.get('/attend/' + original).status_code == 404
    assert guest.get('/attend/' + legacy).status_code == 404
    assert guest.get('/attend/' + fresh).status_code == 200
    with SessionLocal.begin() as db:
        db.get(Booking, record.id).token_expires_at = '2000-01-01T00:00:00+00:00'
    assert guest.get('/attend/' + fresh).status_code == 404
    post(host, f'{path}/bookings/{record.id}/private-link/rotate', {}, path)
    fresh = booking(game_id).access_key
    post(host, f'{path}/bookings/{record.id}/private-link/revoke', {}, path)
    assert guest.get('/attend/' + fresh).status_code == 404
    other_game, _ = game(context)
    assert post(host, f'/games/{other_game}/bookings/{record.id}/private-link/rotate', {}, f'/games/{other_game}').status_code == 404


def test_policy_snapshot_deadlines_safe_maps_and_financial_freeze(context):
    host, guest, club = context
    game_id, public = game(context, maps_url='https://maps.app.goo.gl/test', participation_conditions='Mang giày trong sân')
    post(host, f'/clubs/{club}/settings', {'name': 'CLB đổi', 'skill_guidance': 'Chuyên nghiệp'}, f'/clubs/{club}/settings')
    page = guest.get(public)
    assert 'Trung bình' in page.text and 'Chuyên nghiệp' not in page.text
    assert 'Mang giày trong sân' in page.text and 'https://maps.app.goo.gl/test' in page.text
    register(guest, public, 2)
    record = booking(game_id)
    link = '/attend/' + record.access_key
    with SessionLocal.begin() as db:
        db.get(GameSession, game_id).cancellation_deadline = '2000-01-01T00:00'
    # A later public policy change cannot shorten an existing group's accepted deadline.
    assert post(guest, link + '/edit', {'companion_name': ['Cùng nhóm']}, link).status_code == 200
    with SessionLocal.begin() as db:
        saved = db.get(Booking, record.id)
        accepted = json.loads(saved.policy_snapshot)
        accepted['cancellation_deadline'] = '2000-01-01T00:00'
        saved.policy_snapshot = json.dumps(accepted)
    assert post(guest, link + '/cancel', {}, link).status_code == 400
    assert post(guest, link + '/edit', {}, link).status_code == 400
    with SessionLocal.begin() as db:
        db.get(GameSession, game_id).cancellation_deadline = None
        saved = db.get(Booking, record.id)
        accepted['cancellation_deadline'] = db.get(GameSession, game_id).starts_at
        saved.policy_snapshot = json.dumps(accepted)
        db.get(Booking, record.id).paid = True
    assert post(guest, link + '/edit', {}, link).status_code == 409
    with SessionLocal.begin() as db:
        db.get(GameSession, game_id).registration_deadline = '2000-01-01T00:00'
    assert 'data-phone-lookup' not in guest.get(public).text
    assert 'đóng đăng ký' in register(guest, public, 1, '0902345679').text
    start = (now_local() + timedelta(days=7)).strftime('%Y-%m-%dT19:00')
    invalid = post(host, f'/clubs/{club}/games', {'title': 'bad', 'starts_at': start, 'capacity': 10,
                   'maps_url': 'javascript:alert(1)'}, f'/clubs/{club}')
    assert invalid.status_code == 400


def test_group_gender_quota_reject_reason_and_profile_privacy(context):
    host, guest, club = context
    game_id, public = game(context, capacity=4)
    path = f'/games/{game_id}'
    with SessionLocal.begin() as db:
        db.get(GameSession, game_id).capacity_male = 1
    response = post(guest, public, {'name': 'Lead', 'phone': '0902345678', 'gender': 'male',
                    'companion_name': ['Another'], 'companion_gender': ['male']}, public)
    record = booking(game_id)
    assert record.status == 'waitlist'
    post(host, f'{path}/bookings/{record.id}/approve', {}, path)
    assert booking(game_id).status == 'waitlist'
    post(host, f'{path}/bookings/{record.id}/reject', {'reason': 'Chưa phù hợp trình độ'}, path)
    assert 'Chưa phù hợp trình độ' in guest.get('/attend/' + record.access_key).text
    assert 'Chưa phù hợp trình độ' not in TestClient(app).get(public).text


def test_invalid_group_rolls_back_new_contact_and_no_unowned_reactivation(context):
    host, guest, club = context
    game_id, public = game(context, capacity=2)
    assert register(guest, public, 3).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(Member).where(Member.club_id == club, Member.phone == '0902345678')) is None
    register(guest, public, 1)
    record = booking(game_id)
    link = '/attend/' + record.access_key
    post(guest, link + '/cancel', {}, link)
    with TestClient(app) as stranger:
        register(stranger, public, 2)
    assert booking(game_id).status == 'cancelled' and booking(game_id).party_size == 1


def test_host_policy_edits_need_reason_and_preserve_accepted_booking_policy(context):
    host, guest, club = context
    game_id, public = game(context)
    register(guest, public, 1)
    saved = booking(game_id)
    accepted = saved.policy_snapshot
    path = f'/games/{game_id}'
    with SessionLocal() as db:
        current = db.get(GameSession, game_id)
        data = {'title': current.title, 'venue': 'Sân mới', 'starts_at': current.starts_at,
                'capacity': current.capacity, 'cancellation_policy': 'Báo hủy trước 2 ngày'}
    denied = post(host, path + '/settings', data, path)
    assert denied.status_code == 409
    with SessionLocal() as db:
        assert db.get(GameSession, game_id).venue != 'Sân mới'
    response = post(host, path + '/settings', {**data, 'change_reason': 'Cập nhật cho đăng ký mới'}, path)
    assert response.status_code == 200 and 'Hãy báo thay đổi' in response.text
    assert 'Sân mới' in guest.get(public).text
    assert booking(game_id).policy_snapshot == accepted
    assert 'Báo host trước giờ đánh' in guest.get('/attend/' + saved.access_key).text
    with SessionLocal() as db:
        from app.main import AuditLog
        entry = db.scalar(select(AuditLog).where(AuditLog.club_id == club, AuditLog.action == 'Sửa thông tin buổi đánh'))
        assert 'Cập nhật cho đăng ký mới' in entry.details and 'Báo hủy trước 2 ngày' in entry.details


def test_paid_cancellation_keeps_money_and_duplicate_guest_submit_is_idempotent(context):
    host, guest, club = context
    game_id, public = game(context, mode='AUTO_APPROVE')
    register(guest, public, 2)
    register(guest, public, 2)
    with SessionLocal() as db:
        assert len(db.scalars(select(Booking).where(Booking.session_id == game_id)).all()) == 1
        saved = db.scalar(select(Booking).where(Booking.session_id == game_id))
        assert saved.party_size == 2
    with SessionLocal.begin() as db:
        db.get(Booking, saved.id).paid = True
        db.get(Booking, saved.id).payment_status = 'confirmed'
    link = '/attend/' + saved.access_key
    assert post(guest, link + '/cancel', {}, link).status_code == 200
    result = booking(game_id)
    assert result.status == 'cancelled' and result.paid and result.fee_amount == 140000
    assert 'hoàn tiền thủ công' in guest.get(link).text

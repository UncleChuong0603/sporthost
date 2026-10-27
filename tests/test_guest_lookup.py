import re
import secrets

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func

from app.main import app, Member, Booking, SessionLocal, digits_phone, _lookup_attempts


def token(response, name='csrf'):
    return re.search(r'name="' + name + r'" value="([^"]+)"', response.text).group(1)


def submit(client, path, data, source):
    return client.post(path, data={**data, 'csrf': token(client.get(source))}, follow_redirects=True)


@pytest.fixture
def setup_lookup():
    with TestClient(app) as host, TestClient(app) as guest:
        submit(host, '/signup', {'email': f'lookup-{secrets.token_hex(8)}@example.com',
                                'password': 'guest-lookup-test-password'}, '/signup')
        club = submit(host, '/clubs', {'name': 'Lookup club'}, '/dashboard')
        club_id = int(club.url.path.split('/')[-1])
        source = f'/clubs/{club_id}'
        submit(host, source + '/members', {'name': 'Known guest', 'phone': '0901234567',
                    'kind': 'guest', 'gender': 'female', 'level': 'TB khá'}, source)
        game = submit(host, source + '/games', {'title': 'Phone lookup', 'starts_at': '2026-11-05T19:00',
                         'capacity': 10, 'guest_fee': 70000, 'guest_fee_female': 60000}, source)
        game_id = int(game.url.path.split('/')[-1])
        public = re.search(r'http://testserver/join/[A-Za-z0-9_-]+', game.text).group(0)
        yield host, guest, club_id, game_id, public


def lookup(client, public, phone):
    return submit(client, public + '/lookup', {'phone': phone}, public)


def test_phone_first_lookup_autofills_without_registering(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    first = guest.get(public)
    assert 'data-phone-lookup' in first.text
    assert 'name="phone"' in first.text and 'name="name"' not in first.text
    response = lookup(guest, public, '090 123 4567')
    assert response.status_code == 200
    assert 'value="Known guest"' in response.text
    assert 'value="female" selected' in response.text
    assert 'value="TB khá"' in response.text
    assert '60.000đ' in response.text and 'data-confirm-join' in response.text
    assert 'private' in response.headers['cache-control'] and 'no-store' in response.headers['cache-control']
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id == game_id)) == 0
    result = guest.post(public, data={'phone': '0901234567', 'name': 'Known guest', 'gender': 'female',
                       'level': 'TB khá', 'csrf': token(response), 'lookup_token': token(response, 'lookup_token')}, follow_redirects=True)
    assert 'Đã nhận đăng ký' in result.text
    with SessionLocal() as db:
        booking = db.scalar(select(Booking).where(Booking.session_id == game_id))
        assert booking.status == 'pending' and booking.fee_amount == 60000


def test_unknown_number_is_blank_until_user_confirms(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    result = lookup(guest, public, '0902345678')
    assert 'Bạn chưa có hồ sơ' in result.text and 'name="name" value=""' in result.text
    assert 'value="Known guest"' not in result.text
    with SessionLocal() as db:
        assert db.scalar(select(Member).where(Member.club_id == club_id, Member.phone == '0902345678')) is None
    confirmed = guest.post(public, data={'phone': '0902345678', 'name': 'New player', 'gender': 'male',
                           'csrf': token(result), 'lookup_token': token(result, 'lookup_token')}, follow_redirects=True)
    assert 'Đã nhận đăng ký' in confirmed.text


def test_lookup_does_not_read_another_club_profile(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    other = submit(host, '/clubs', {'name': 'Another club'}, '/dashboard')
    other_id = int(other.url.path.split('/')[-1])
    submit(host, f'/clubs/{other_id}/members', {'name': 'Private other-club name', 'phone': '0903456789',
                                             'kind': 'guest'}, f'/clubs/{other_id}')
    response = lookup(guest, public, '0903456789')
    assert 'Private other-club name' not in response.text
    assert 'Bạn chưa có hồ sơ' in response.text


def test_lookup_token_cannot_confirm_a_different_phone(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    review = lookup(guest, public, '0901234567')
    response = guest.post(public, data={'phone': '0902345678', 'name': 'Wrong phone',
                    'csrf': token(review), 'lookup_token': token(review, 'lookup_token')})
    assert response.status_code == 403
    assert guest.post(public + '/lookup', data={'phone': '0901234567', 'csrf': 'bad'}).status_code == 403


def test_changed_profile_requires_a_fresh_confirmation(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    review = lookup(guest, public, '0901234567')
    with SessionLocal() as db:
        record = db.scalar(select(Member).where(Member.club_id == club_id, Member.phone == '0901234567'))
    submit(host, f'/clubs/{club_id}/members/{record.id}/edit', {'name': 'Updated by host', 'phone': record.phone,
                        'kind': 'guest', 'gender': 'male', 'level': record.level}, f'/clubs/{club_id}')
    result = guest.post(public, data={'phone': record.phone, 'name': record.name, 'gender': record.gender,
                   'csrf': token(review), 'lookup_token': token(review, 'lookup_token')})
    assert result.status_code == 200 and 'Thông tin vừa được cập nhật' in result.text
    assert 'value="Updated by host"' in result.text
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id == game_id)) == 0


def test_lookup_handles_invalid_phones_closed_sessions_and_limits(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    invalid = lookup(guest, public, 'not-a-phone')
    assert invalid.status_code == 200 and 'Số điện thoại chưa hợp lệ' in invalid.text
    _lookup_attempts.clear()
    for _ in range(30):
        assert lookup(guest, public, '0901234567').status_code == 200
    limited = lookup(guest, public, '0901234567')
    assert limited.status_code == 429 and limited.headers['retry-after'] == '60'
    _lookup_attempts.clear()
    csrf = token(guest.get(public))
    submit(host, f'/games/{game_id}/toggle-open', {}, f'/games/{game_id}')
    closed = guest.post(public + '/lookup', data={'phone': '0901234567', 'csrf': csrf}, follow_redirects=True)
    assert 'value="Known guest"' not in closed.text and 'chưa nhận đăng ký' in closed.text


@pytest.mark.parametrize('phone', ['0901234567', '+84901234567', '84901234567', '+84 90 123 4567'])
def test_vietnam_phone_formats_find_the_same_guest(setup_lookup, phone):
    host, guest, club_id, game_id, public = setup_lookup
    assert digits_phone(phone) == '0901234567'
    assert 'value="Known guest"' in lookup(guest, public, phone).text


def test_lookup_finds_legacy_international_phone_without_duplicate_member(setup_lookup):
    host, guest, club_id, game_id, public = setup_lookup
    with SessionLocal.begin() as db:
        db.add(Member(club_id=club_id, name='Legacy international', phone='+84904567890', kind='guest', gender='male', level='TB'))
    review = lookup(guest, public, '0904567890')
    assert 'value="Legacy international"' in review.text
    result = guest.post(public, data={'phone': '0904567890', 'name': 'Legacy international', 'gender': 'male',
                'csrf': token(review), 'lookup_token': token(review, 'lookup_token')}, follow_redirects=True)
    assert 'Đã nhận đăng ký' in result.text
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Member).where(Member.club_id == club_id)) == 2

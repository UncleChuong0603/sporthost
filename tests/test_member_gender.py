import csv
import importlib.util
import io
import re
import secrets
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app, Member, Booking, SessionLocal, GameSession, member_fee


def post(client, path, data, source):
    page = client.get(source)
    csrf = re.search(r'name="csrf" value="([^"]+)"', page.text).group(1)
    return client.post(path, data={**data, 'csrf': csrf}, follow_redirects=True)


@pytest.fixture
def host_club():
    with TestClient(app) as client:
        email = f'gender-{secrets.token_hex(8)}@example.com'
        post(client, '/signup', {'email': email, 'password': 'test-member-password'}, '/signup')
        result = post(client, '/clubs', {'name': 'Gender test club'}, '/dashboard')
        yield client, int(result.url.path.split('/')[-1])


def member(club_id, phone):
    with SessionLocal() as db:
        return db.scalar(select(Member).where(Member.club_id == club_id, Member.phone == phone))


@pytest.mark.parametrize('gender,kind,label', [('male', 'fixed', 'Nam'), ('female', 'guest', 'Nữ')])
def test_host_can_add_and_edit_gender_independently_of_member_kind(host_club, gender, kind, label):
    client, club_id = host_club
    source = f'/clubs/{club_id}'
    data = {'name': 'Player', 'phone': '0901234501', 'kind': kind, 'gender': gender}
    result = post(client, source + '/members', data, source)
    assert result.status_code == 200
    assert f'<td>{label}</td>' in result.text
    record = member(club_id, data['phone'])
    assert record.gender == gender and record.kind == kind
    changed_gender = 'female' if gender == 'male' else 'male'
    result = post(client, f'{source}/members/{record.id}/edit', dict(data, gender=changed_gender), source)
    assert result.status_code == 200
    assert member(club_id, data['phone']).gender == changed_gender
    assert f'value="{changed_gender}" selected' in result.text
    # An older open form without gender must preserve the recorded value.
    data.pop('gender')
    post(client, f'{source}/members/{record.id}/edit', data, source)
    assert member(club_id, data['phone']).gender == changed_gender


def test_unknown_existing_gender_and_invalid_input_do_not_become_male(host_club):
    client, club_id = host_club
    source = f'/clubs/{club_id}'
    data = {'name': 'Existing player', 'phone': '0901234502', 'kind': 'fixed'}
    post(client, source + '/members', data, source)
    record = member(club_id, data['phone'])
    assert record.gender == 'unspecified'
    assert post(client, f'{source}/members/{record.id}/edit', dict(data, gender='invalid'), source).status_code == 400
    assert member(club_id, data['phone']).gender == 'unspecified'
    assert post(client, source + '/members', dict(data, phone='0901234503', gender='invalid'), source).status_code == 400
    assert member(club_id, '0901234503') is None


def test_public_gender_roster_totals_csv_and_profile_ownership(host_club):
    client, club_id = host_club
    source = f'/clubs/{club_id}'
    result = post(client, source + '/games', {'title': 'Mixed session', 'starts_at': '2026-11-05T19:00',
                                            'capacity': 3, 'guest_fee': 70000}, source)
    game_id = int(result.url.path.split('/')[-1])
    game_path = f'/games/{game_id}'
    public = re.search(r'http://testserver/join/[A-Za-z0-9_-]+', result.text).group(0)
    with TestClient(app) as guest:
        for i, gender in enumerate(['male', 'female', 'unspecified']):
            data = {'name': f'Guest {i}', 'phone': f'090234560{i}', 'gender': gender}
            assert post(guest, public, data, public).status_code == 200
        assert post(guest, public, {'name': 'Bad', 'phone': '0902345609', 'gender': 'invalid'}, public).status_code == 400
        # Knowing someone's phone number cannot change their existing profile.
        post(guest, public, {'name': 'Overwrite', 'phone': '0902345600', 'gender': 'female'}, public)
        assert member(club_id, '0902345600').gender == 'male'
    page = client.get(game_path)
    assert '0 nam · 0 nữ · 0 chưa cập nhật' in page.text
    with SessionLocal() as db:
        bookings = list(db.scalars(select(Booking).where(Booking.session_id == game_id)))
    for booking in bookings:
        assert post(client, f'{game_path}/bookings/{booking.id}/approve', {}, game_path).status_code == 200
    page = client.get(game_path)
    assert '1 nam · 1 nữ · 1 chưa cập nhật' in page.text
    assert '3/3' in page.text and '210.000đ' in page.text
    rows = list(csv.DictReader(io.StringIO(client.get(game_path + '/export.csv').content.decode('utf-8-sig'))))
    assert {row['Giới tính'] for row in rows} == {'Nam', 'Nữ', 'Chưa cập nhật'}
    post(client, f'{game_path}/bookings/{bookings[0].id}/waitlist', {}, game_path)
    assert '2/3' in client.get(game_path).text
    with TestClient(app) as other:
        post(other, '/signup', {'email': f'other-{secrets.token_hex(8)}@example.com', 'password': 'test-member-password'}, '/signup')
        record = member(club_id, '0902345600')
        assert post(other, f'{source}/members/{record.id}/edit', {'name': record.name, 'phone': record.phone,
                    'kind': 'guest', 'gender': 'female'}, '/dashboard').status_code == 404
        assert member(club_id, record.phone).gender == 'male'


def test_gender_migration_preserves_existing_data_and_stays_in_schema():
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    path = Path(__file__).resolve().parents[1] / 'alembic/versions/0002_member_gender.py'
    with patch('app.settings.load_settings', return_value={'schema': 'clubhost'}):
        spec = importlib.util.spec_from_file_location('member_gender_migration', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    result = io.StringIO()
    context = MigrationContext.configure(dialect_name='postgresql', opts={'as_sql': True, 'output_buffer': result})
    with Operations.context(context):
        module.upgrade()
    sql = result.getvalue()
    assert "ALTER TABLE clubhost.members ADD COLUMN gender VARCHAR DEFAULT 'unspecified' NOT NULL" in sql
    assert 'ck_member_gender' in sql
    assert 'public.' not in sql and 'DROP ' not in sql and 'DELETE ' not in sql


@pytest.mark.parametrize('kind,gender,expected', [
    ('fixed', 'male', 20000), ('fixed', 'female', 0), ('fixed', 'unspecified', 30000),
    ('guest', 'male', 80000), ('guest', 'female', 60000), ('guest', 'unspecified', 70000),
])
def test_gender_price_rules_and_zero_fee(kind, gender, expected):
    game = GameSession(fixed_fee=30000, guest_fee=70000, fixed_fee_male=20000,
                       fixed_fee_female=0, guest_fee_male=80000, guest_fee_female=60000)
    assert member_fee(game, Member(kind=kind, gender=gender)) == expected


def test_gender_prices_apply_to_bookings_without_changing_history(host_club):
    client, club_id = host_club
    source = f'/clubs/{club_id}'
    game_data = {'title': 'Gender pricing', 'starts_at': '2026-11-05T19:00', 'capacity': 5,
                 'guest_fee': 70000, 'fixed_fee': 30000, 'guest_fee_male': 80000,
                 'guest_fee_female': 60000, 'fixed_fee_female': 0}
    result = post(client, source + '/games', game_data, source)
    assert result.status_code == 200
    game_id = int(result.url.path.split('/')[-1])
    game_path = f'/games/{game_id}'
    public = re.search(r'http://testserver/join/[A-Za-z0-9_-]+', result.text).group(0)
    assert '80.000đ' in client.get(public).text and '60.000đ' in client.get(public).text
    post(client, source + '/members', {'name': 'Fixed female', 'phone': '0903456700',
                                      'kind': 'fixed', 'gender': 'female'}, source)
    fixed = member(club_id, '0903456700')
    post(client, game_path + '/fixed', {'member_id': fixed.id}, game_path)
    with TestClient(app) as guest:
        for i, gender in enumerate(['male', 'female', 'unspecified']):
            post(guest, public, {'name': f'Guest {i}', 'phone': f'090345671{i}', 'gender': gender}, public)
    with SessionLocal() as db:
        bookings = list(db.scalars(select(Booking).where(Booking.session_id == game_id)))
        assert sorted(b.fee_amount for b in bookings) == [0, 60000, 70000, 80000]
    for b in bookings:
        post(client, f'{game_path}/bookings/{b.id}/approve', {}, game_path)
    assert '210.000đ' in client.get(game_path).text
    # Later profile edits must not reprice a booked or paid session.
    post(client, f'{source}/members/{fixed.id}/edit', {'name': fixed.name, 'phone': fixed.phone,
         'kind': 'guest', 'gender': 'male'}, source)
    with SessionLocal() as db:
        saved = db.scalar(select(Booking).where(Booking.session_id == game_id, Booking.member_id == fixed.id))
        assert saved.fee_amount == 0
    csv_rows = list(csv.DictReader(io.StringIO(client.get(game_path + '/export.csv').content.decode('utf-8-sig'))))
    assert next(row for row in csv_rows if row['Số điện thoại'] == fixed.phone)['Phí buổi (VND)'] == '0'
    assert '210.000đ' in client.get(game_path).text
    assert post(client, source + '/games', dict(game_data, guest_fee_female=-1), source).status_code == 400

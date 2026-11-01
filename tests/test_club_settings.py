"""Action plan Sprint 1: settings, access control and legacy compatibility."""
import importlib.util
import io
import json
import re
import secrets
from pathlib import Path
from unittest.mock import patch

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import select, text, func

from app.main import app, SessionLocal, Club, Host, AuditLog, GameSession, Booking, Member, MonthlyDue
from app.club_settings import CLUB_DEFAULTS, settings_snapshot
from app.sports import SPORTS


def token(response):
    return re.search(r'name="csrf" value="([^"]+)"', response.text).group(1)


def post(client, path, data, source='/clubs'):
    return client.post(path, data={**data, 'csrf': token(client.get(source))}, follow_redirects=True)


def signup(client):
    email = f'settings-{secrets.token_hex(8)}@example.com'
    assert post(client, '/signup', {'email': email, 'password': 'settings-test-password'}, '/signup').status_code == 200
    return email


@pytest.fixture
def host_club():
    with TestClient(app) as host:
        signup(host)
        result = post(host, '/clubs', {'name': 'CLB thể thao'})
        assert result.status_code == 200
        yield host, int(result.url.path.split('/')[-1])


def read_club(club_id):
    with SessionLocal() as db:
        return db.get(Club, club_id)


def test_create_and_edit_all_settings_and_complete_audit(host_club):
    host, club_id = host_club
    source = f'/clubs/{club_id}/settings'
    values = dict(name='CLB Giao lưu', location='Quận 8', sport_type='pickleball', default_capacity=16,
                  skill_guidance='Người mới đến trung bình khá', default_approval_mode='AUTO_APPROVE',
                  default_fee_mode='COST_SHARING', cancellation_policy=('Báo hủy trước 6 giờ. ' * 40).strip(),
                  venue_instructions='Gửi xe cổng sau, sân số 2.')
    before = settings_snapshot(read_club(club_id))
    response = post(host, f'/clubs/{club_id}/settings', values, source)
    assert response.status_code == 200 and 'Đã lưu cài đặt CLB.' in response.text
    saved = read_club(club_id)
    assert settings_snapshot(saved) == values
    assert 'value="pickleball" selected' in response.text
    assert 'value="AUTO_APPROVE" selected' in response.text
    assert 'value="COST_SHARING" selected' in response.text
    assert 'Môn thể thao: Cầu lông → Pickleball' in response.text
    assert '&quot;before&quot;' not in response.text
    assert 'Pickleball' in host.get(f'/clubs/{club_id}').text
    with SessionLocal() as db:
        entries = db.scalars(select(AuditLog).where(AuditLog.club_id == club_id).order_by(AuditLog.id)).all()
        assert entries[0].action == 'Tạo CLB'
        assert json.loads(entries[-1].details) == {'before': before, 'after': values}
        assert entries[-1].host_id == saved.owner_id
    schedule = host.get(f'/schedule?club_id={club_id}&create=1')
    assert 'name="capacity" type="number" min="1" max="200" value="16"' in schedule.text


@pytest.mark.parametrize('sport', list(SPORTS))
def test_create_with_each_catalog_sport(host_club, sport):
    host, _ = host_club
    result = post(host, '/clubs', {'name': 'CLB mới', 'sport_type': sport})
    assert result.status_code == 200
    club_id = int(result.url.path.split('/')[-1])
    assert read_club(club_id).sport_type == sport
    assert SPORTS[sport]['label'] in result.text


@pytest.mark.parametrize('field,value', [
    ('sport_type', 'unknown'), ('sport_type', ''), ('default_capacity', 0), ('default_capacity', 201),
    ('default_capacity', '1.5'), ('default_capacity', ''), ('default_approval_mode', 'confirmed'),
    ('default_fee_mode', 'paid'), ('skill_guidance', 'x' * 501),
    ('cancellation_policy', 'x' * 2001), ('venue_instructions', 'x' * 2001), ('name', ' '),
])
def test_invalid_settings_are_rejected_atomically(host_club, field, value):
    host, club_id = host_club
    source = f'/clubs/{club_id}/settings'
    before = settings_snapshot(read_club(club_id))
    with SessionLocal() as db:
        audit_count = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.club_id == club_id))
    data = {'name': 'Không được lưu một phần', field: value}
    response = post(host, f'/clubs/{club_id}/settings', data, source)
    assert response.status_code == 400
    assert settings_snapshot(read_club(club_id)) == before
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.club_id == club_id)) == audit_count


def test_legacy_forms_and_database_defaults_preserve_existing_settings(host_club):
    host, club_id = host_club
    club = read_club(club_id)
    assert {key: getattr(club, key) for key in CLUB_DEFAULTS} == CLUB_DEFAULTS
    post(host, f'/clubs/{club_id}/settings', {'name': club.name, 'sport_type': 'tennis', 'default_capacity': 12})
    result = post(host, f'/clubs/{club_id}/settings', {'name': 'Đổi tên từ form cũ', 'location': 'Q7'})
    assert result.status_code == 200
    saved = read_club(club_id)
    assert saved.sport_type == 'tennis' and saved.default_capacity == 12
    # Raw SQL bypasses ORM-side defaults, like an old app writing to the new schema.
    with SessionLocal.begin() as db:
        new_id = db.scalar(text("INSERT INTO clubs (owner_id, name, location) VALUES (:owner, 'Legacy', '') RETURNING id"), {'owner': club.owner_id})
    saved = read_club(new_id)
    assert {key: getattr(saved, key) for key in CLUB_DEFAULTS} == CLUB_DEFAULTS


def test_owner_only_settings_csrf_and_cross_tenant_access(host_club):
    host, club_id = host_club
    source = f'/clubs/{club_id}/settings'
    before = settings_snapshot(read_club(club_id))
    assert host.post(f'/clubs/{club_id}/settings', data={'name': 'Bad CSRF', 'csrf': 'bad'}).status_code == 403
    with TestClient(app) as other:
        email = signup(other)
        assert other.get(source).status_code == 404
        assert post(other, f'/clubs/{club_id}/settings', {'name': 'Other tenant'}).status_code == 404
        for role in ('manager', 'finance'):
            assert post(host, f'/clubs/{club_id}/cohosts', {'email': email, 'role': role}, source).status_code == 200
            assert other.get(source).status_code == 200
            assert 'name="sport_type"' not in other.get(source).text
            assert post(other, f'/clubs/{club_id}/settings', {'name': 'Forbidden'}).status_code == 403
    with TestClient(app) as anonymous:
        assert anonymous.get(source).status_code == 401
        assert anonymous.post(f'/clubs/{club_id}/settings', data={'csrf': 'bad', 'name': 'Guest'}).status_code == 401
    assert settings_snapshot(read_club(club_id)) == before


def test_sport_labels_and_legacy_financial_data_remain_independent(host_club):
    host, club_id = host_club
    result = post(host, f'/clubs/{club_id}/games', {'title': 'Giao lưu', 'starts_at': '2027-01-08T19:00',
                  'capacity': 8, 'guest_fee': 70000}, f'/clubs/{club_id}')
    game_id = int(result.url.path.split('/')[-1])
    with SessionLocal.begin() as db:
        member = Member(club_id=club_id, name='Khách', phone='0901234567', kind='guest')
        db.add(member); db.flush()
        booking = Booking(session_id=game_id, member_id=member.id, status='confirmed', fee_amount=70000,
                          paid=True, payment_status='confirmed')
        db.add(booking)
        due = MonthlyDue(member_id=member.id, period='2027-01', amount=300000)
        db.add(due); db.flush()
        booking_id, due_id = booking.id, due.id
        public_id = db.get(GameSession, game_id).public_id
    assert 'Tiền sân / tiền cầu' in host.get(f'/games/{game_id}').text
    post(host, f'/clubs/{club_id}/settings', {'sport_type': 'football', 'default_fee_mode': 'COST_SHARING'})
    game_page = host.get(f'/games/{game_id}').text
    assert 'Tiền sân / chi phí dụng cụ / khác' in game_page and 'Tiền sân / tiền cầu' not in game_page
    assert 'Chưa điểm danh' in game_page and 'member cố định' not in game_page and 'Chờ slot' not in game_page
    with TestClient(app) as guest:
        page = guest.get('/join/' + public_id)
        assert 'Bóng đá' in page.text and '0901234567' not in page.text
    with SessionLocal() as db:
        game = db.get(GameSession, game_id); booking = db.get(Booking, booking_id); due = db.get(MonthlyDue, due_id)
        assert game.capacity == 8 and game.guest_fee == 70000
        assert booking.paid and booking.fee_amount == 70000 and booking.status == 'confirmed'
        assert due.amount == 300000 and not due.paid


def test_new_migration_only_adds_settings_in_dedicated_schema():
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/0005_club_settings.py'
    with patch('app.settings.load_settings', return_value={'schema': 'sporthost_test'}):
        spec = importlib.util.spec_from_file_location('club_settings_migration', path)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    result = io.StringIO()
    context = MigrationContext.configure(dialect_name='postgresql', opts={'as_sql': True, 'output_buffer': result})
    with Operations.context(context):
        module.upgrade()
    sql = result.getvalue()
    assert sql.count('ALTER TABLE sporthost_test.clubs ADD COLUMN') == 7
    assert "sport_type VARCHAR DEFAULT 'badminton' NOT NULL" in sql
    assert "default_fee_mode VARCHAR DEFAULT 'FIXED_PRICE' NOT NULL" in sql
    assert "default_approval_mode VARCHAR DEFAULT 'MANUAL_APPROVE' NOT NULL" in sql
    assert 'ck_club_default_capacity' in sql
    assert not any(word in sql.upper() for word in ('DROP ', 'DELETE ', 'TRUNCATE ', 'PUBLIC.'))
    with pytest.raises(RuntimeError, match='Destructive downgrade disabled'):
        module.downgrade()

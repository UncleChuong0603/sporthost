"""Club deletion must enforce ownership and leave no dependent records behind."""
import json
import secrets
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.main import (
    app, engine, SessionLocal, AuditLog, Booking, BookingParticipant, Charge,
    ChargeAdjustment, ChargeBatch, Club, ClubAccess, Expense, GameSession, Host,
    Member, MoneyMovement, MonthlyDue, PaymentProof, RecurringRule, StoredAsset,
    SubscriptionRequest,
)
from app.storage import local_path, put_image
from test_group_bookings import csrf, post
from test_billing import finished, issue, receipt


@pytest.fixture
def context():
    # Give each test its own client address so signups do not consume the shared
    # suite's hourly bucket; production rate limiting remains enabled.
    address = f'club-deletion-{secrets.token_hex(8)}'
    with TestClient(app, client=(address, 50000)) as host, TestClient(app, client=(address, 50001)) as guest:
        post(host, '/signup', {'email': f'{address}@example.com', 'password': 'delete-test-password'}, '/signup')
        result = post(host, '/clubs', {'name': 'CLB nhóm'}, '/clubs')
        yield host, guest, int(result.url.path.split('/')[-1])


@pytest.fixture(autouse=True)
def enforce_foreign_keys():
    # SQLite normally omits enforcement; exercise the production dependency order.
    def enable(connection, record, proxy):
        connection.execute('PRAGMA foreign_keys=ON')

    event.listen(engine, 'checkout', enable)
    yield
    event.remove(engine, 'checkout', enable)
    engine.dispose()


def remove(host, club_id, name='CLB nhóm'):
    return post(host, f'/clubs/{club_id}/delete', {'confirmation_name': name}, '/clubs')


def test_owner_can_delete_empty_club_and_keep_audit(context):
    host, _, club_id = context
    with SessionLocal() as db:
        owner_id = db.get(Club, club_id).owner_id
        audit_ids = db.scalars(select(AuditLog.id).where(AuditLog.club_id == club_id)).all()
    assert f'href="#delete"' in host.get(f'/clubs/{club_id}/settings').text
    result = remove(host, club_id)
    assert result.status_code == 200 and result.url.path == '/clubs'
    assert 'Đã xóa CLB và dữ liệu liên quan.' in result.text
    assert host.get(f'/clubs/{club_id}').status_code == 404
    with SessionLocal() as db:
        assert db.get(Club, club_id) is None
        assert db.get(Host, owner_id) is not None
        for audit_id in audit_ids:
            entry = db.get(AuditLog, audit_id)
            assert entry.club_id is None and f'CLB #{club_id}' in entry.details
        entry = db.scalar(select(AuditLog).where(AuditLog.host_id == owner_id, AuditLog.action == 'Xóa CLB'))
        assert json.loads(entry.details) == {'club_id': club_id, 'name': 'CLB nhóm'}
    assert remove(host, club_id).status_code == 404


@pytest.mark.parametrize('name', ['', 'Sai tên', 'clb nhóm'])
def test_exact_confirmation_name_required(context, name):
    host, _, club_id = context
    assert remove(host, club_id, name).status_code == 400
    with SessionLocal() as db:
        assert db.get(Club, club_id) is not None


def test_csrf_authentication_and_owner_only_even_with_all_permissions(context):
    host, guest, club_id = context
    path = f'/clubs/{club_id}/delete'
    assert host.get(path).status_code == 405
    for value in ('', 'invalid', csrf(guest.get('/signup'))):
        assert host.post(path, data={'confirmation_name': 'CLB nhóm', 'csrf': value}).status_code == 403
    assert guest.post(path, data={'confirmation_name': 'CLB nhóm'}).status_code == 401
    email = f'delete-{secrets.token_hex(8)}@example.com'
    post(guest, '/signup', {'email': email, 'password': 'delete-test-password'}, '/signup')
    assert remove(guest, club_id).status_code == 404
    with SessionLocal.begin() as db:
        other_id = db.scalar(select(Host.id).where(Host.email == email))
        db.add(ClubAccess(club_id=club_id, host_id=other_id, role='custom', permissions=json.dumps(
            ['manage_session', 'manage_bookings', 'check_in', 'manage_finance', 'edit_club_settings'])))
    assert 'id="delete"' not in guest.get(f'/clubs/{club_id}/settings').text
    assert remove(guest, club_id).status_code == 403
    with SessionLocal() as db:
        assert db.get(Club, club_id) is not None


def test_deletes_populated_club_and_files_without_touching_other_club(context):
    host, guest, club_id = context
    other = post(host, '/clubs', {'name': 'CLB giữ lại'}, '/clubs')
    other_id = int(other.url.path.split('/')[-1])
    with SessionLocal.begin() as db:
        other_member = Member(club_id=other_id, name='Thành viên khác', phone='0905556666', kind='fixed')
        db.add(other_member)
    models = (Club, GameSession, Member, Booking, BookingParticipant, ChargeBatch, Charge,
              ChargeAdjustment, MoneyMovement, Expense, MonthlyDue, PaymentProof,
              RecurringRule, StoredAsset, ClubAccess, SubscriptionRequest)
    with SessionLocal() as db:
        untouched = {model: set(db.scalars(select(model.id)).all()) for model in models}
        untouched[Club].remove(club_id)
    game_id, booking = finished(context, size=2)
    assert issue(host, game_id).status_code == 200
    assert receipt(host, game_id, booking, 10000).status_code == 200
    with SessionLocal() as db:
        movement = db.scalar(select(MoneyMovement).where(MoneyMovement.session_id == game_id))
    assert receipt(host, game_id, booking, 10000, kind='REVERSAL', reverses_id=movement.id,
                   reason='Ghi nhầm').status_code == 200
    key, digest = put_image(b'image bytes for deletion test', club_id, 'proof')
    with SessionLocal.begin() as db:
        rule = RecurringRule(club_id=club_id, title='Lịch tuần', venue='', first_start='2027-01-01T19:00',
                             weeks=2, capacity=8, fixed_fee=0, guest_fee=70000, rsvp_hours=24)
        db.add(rule)
        db.flush()
        db.get(GameSession, game_id).recurring_rule_id = rule.id
        asset = StoredAsset(club_id=club_id, key=key, sha256=digest, kind='proof', size=29)
        due = MonthlyDue(member_id=booking.member_id, period='2027-01', amount=300000)
        db.add_all([asset, due])
        db.flush()
        proof = PaymentProof(asset_id=asset.id, booking_id=booking.id,
                             payer_participant_id=booking.participants[0].id)
        due_proof = PaymentProof(asset_id=asset.id, due_id=due.id)
        db.add_all([proof, due_proof])
        db.flush()
        db.get(MoneyMovement, movement.id).proof_id = proof.id
        charge = db.scalar(select(Charge).where(Charge.booking_id == booking.id))
        db.add(ChargeAdjustment(batch_id=charge.batch_id, charge_id=charge.id, amount=-1000,
                               version=2, reason='Giảm phí', created_by=movement.confirmed_by,
                               request_key=secrets.token_hex(12)))
        db.add(Expense(session_id=game_id, title='Tiền sân', amount=100000))
        db.add(SubscriptionRequest(club_id=club_id, months=1, amount=100000, reference='test'))
        db.add(ClubAccess(club_id=club_id, host_id=movement.confirmed_by, role='manager'))
        db.flush()
        public_id = db.get(GameSession, game_id).public_id
        due_key = due.access_key
    assert local_path(key).exists()
    result = remove(host, club_id)
    assert result.status_code == 200
    assert not local_path(key).exists()
    assert guest.get(f'/join/{public_id}').status_code == 404
    assert guest.get(f'/attend/{booking.access_key}').status_code == 404
    assert guest.get(f'/dues/pay/{due_key}').status_code == 404
    assert host.get(f'/clubs/{other_id}').status_code == 200
    with SessionLocal() as db:
        for model, expected in untouched.items():
            assert set(db.scalars(select(model.id)).all()) == expected, model.__name__
        assert db.get(Member, other_member.id).name == 'Thành viên khác'


def test_commit_failure_rolls_back_and_keeps_images(context):
    host, _, club_id = context
    key, digest = put_image(b'keep this image', club_id, 'qr')
    with SessionLocal.begin() as db:
        db.add(StoredAsset(club_id=club_id, key=key, sha256=digest, kind='qr', size=15))
        db.get(Club, club_id).qr_key = key
    with patch.object(Session, 'commit', side_effect=RuntimeError('database unavailable')):
        with pytest.raises(RuntimeError, match='database unavailable'):
            remove(host, club_id)
    assert local_path(key).read_bytes() == b'keep this image'
    with SessionLocal() as db:
        assert db.get(Club, club_id).qr_key == key
        assert db.scalar(select(StoredAsset).where(StoredAsset.key == key)) is not None
        assert db.scalar(select(AuditLog).where(AuditLog.club_id == club_id)) is not None


def test_storage_failure_is_logged_after_database_commit(context, caplog):
    host, _, club_id = context
    with SessionLocal.begin() as db:
        db.add(StoredAsset(club_id=club_id, key=f'clubs/{club_id}/qr/test.png',
                           sha256='digest', kind='qr', size=10))
    with patch('app.club_deletion.delete_image', side_effect=RuntimeError('storage unavailable')):
        assert remove(host, club_id).status_code == 200
    with SessionLocal() as db:
        assert db.get(Club, club_id) is None
    assert 'Could not remove stored image' in caplog.text

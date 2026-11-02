"""Fixed member defaults must reach bookings without changing historical fees."""
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from test_club_settings import host_club, post, signup
from app.main import app, SessionLocal, Club, Member, GameSession, Booking, MonthlyDue
from app.finance_service import draft


def save_prices(host, club_id, **overrides):
    return post(host, f'/clubs/{club_id}/fixed-prices',
                {'fixed_fee': 40000, 'fixed_fee_male': 45000, 'fixed_fee_female': 0, **overrides},
                f'/clubs/{club_id}/settings')


def test_fixed_member_defaults_reach_single_and_recurring_bookings(host_club):
    host, club_id = host_club
    source = f'/clubs/{club_id}'
    response = save_prices(host, club_id)
    assert response.status_code == 200 and 'Đã lưu phí thành viên cố định.' in response.text
    assert 'name="monthly_fee"' not in response.text
    assert 'Phí tháng</a>' not in host.get(source).text
    assert '/dues/bulk' not in host.get(f'/finance?club_id={club_id}').text
    for index, gender in enumerate(('male', 'female', 'unspecified')):
        assert post(host, source+'/members', {'name': gender, 'phone': f'090123450{index}',
                    'gender': gender, 'kind': 'fixed'}, source).status_code == 200
    data = dict(title='Fixed member prices', starts_at='2027-01-07T19:00', capacity=10, guest_fee=70000)
    response = post(host, source+'/games', data, source)
    game_id = int(response.url.path.split('/')[-1])
    with SessionLocal() as db:
        members = db.scalars(select(Member).where(Member.club_id == club_id).order_by(Member.id)).all()
        game = db.get(GameSession, game_id)
        assert (game.fixed_fee, game.fixed_fee_male, game.fixed_fee_female) == (40000, 45000, 0)
        assert game.monthly_policy == 'SESSION_FEE'
    for member in members:
        assert post(host, f'/games/{game_id}/fixed', {'member_id': member.id}, f'/games/{game_id}').status_code == 200
    with SessionLocal.begin() as db:
        # A historical paid monthly due must not waive the new per-session fee.
        db.add(MonthlyDue(member_id=members[0].id, period='2027-01', amount=300000, paid=True))
        game = db.get(GameSession, game_id)
        for booking in db.scalars(select(Booking).where(Booking.session_id == game_id)):
            booking.participants[0].attendance_status = 'CHECKED_IN'
        db.flush()
        assert sorted(p['amount'] for p in draft(db, game)['people']) == [0, 40000, 45000]
    assert post(host, '/workspace/games', {**data, 'club_id': club_id, 'weeks': 2}, '/schedule').status_code == 200
    assert save_prices(host, club_id, fixed_fee=30000, fixed_fee_male='', fixed_fee_female='').status_code == 200
    with SessionLocal() as db:
        games = db.scalars(select(GameSession).where(GameSession.club_id == club_id)).all()
        assert len(games) == 3
        assert all(g.fixed_fee == 40000 and g.fixed_fee_female == 0 for g in games)
        invitations = db.scalars(select(Booking).join(GameSession).where(GameSession.club_id == club_id,
                                GameSession.recurring_rule_id.is_not(None))).all()
        assert sorted(b.fee_amount for b in invitations) == [0, 0, 40000, 40000, 45000, 45000]
        assert all(json.loads(b.policy_snapshot)['monthly_policy'] == 'SESSION_FEE' for b in invitations)
    # Explicit zero fees override the saved club defaults.
    response = post(host, source+'/games', {**data, 'fixed_fee': 0, 'fixed_fee_female': ''}, source)
    with SessionLocal() as db:
        assert db.get(GameSession, int(response.url.path.split('/')[-1])).fixed_fee == 0


@pytest.mark.parametrize('field,value', [('fixed_fee', -1), ('fixed_fee', 100000001),
    ('fixed_fee_male', '-1'), ('fixed_fee_female', 'invalid')])
def test_invalid_fixed_member_prices_are_atomic(host_club, field, value):
    host, club_id = host_club
    assert save_prices(host, club_id).status_code == 200
    assert save_prices(host, club_id, **{field: value}).status_code == 400
    with SessionLocal() as db:
        club = db.get(Club, club_id)
        assert (club.fixed_fee, club.fixed_fee_male, club.fixed_fee_female) == (40000, 45000, 0)


def test_fixed_member_prices_require_finance_access_and_csrf(host_club):
    host, club_id = host_club
    path = f'/clubs/{club_id}/fixed-prices'
    assert host.post(path, data={'fixed_fee': 1, 'csrf': 'bad'}).status_code == 403
    with TestClient(app) as other:
        signup(other)
        assert post(other, path, {'fixed_fee': 1}).status_code == 404
    with SessionLocal() as db:
        assert db.get(Club, club_id).fixed_fee == 50000

import io
import re
import secrets
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select,func

from app.main import (app, SessionLocal, Host, Club, Member, GameSession, Booking, MonthlyDue,
                      ClubAccess, PaymentProof, EmailToken, StoredAsset)
from app.workspace import now_local
from app.accounts import new_token


def token(response,name='csrf'):
    found=re.search(r'name="'+name+r'" value="([^"]+)"',response.text)
    assert found,response.text[:200]
    return found.group(1)


def post(client,path,data,source):
    return client.post(path,data={**data,'csrf':token(client.get(source))},follow_redirects=True)


def signup(client):
    email=f'roadmap-{secrets.token_hex(9)}@example.com'
    assert post(client,'/signup',{'email':email,'password':'long-strong-test-password'},'/signup').status_code==200
    return email


@pytest.fixture
def setup():
    with TestClient(app) as host:
        email=signup(host);response=post(host,'/clubs',{'name':'Roadmap club'},'/dashboard')
        club_id=int(response.url.path.split('/')[-1]);source=f'/clubs/{club_id}'
        for i,gender in enumerate(['male','female']):
            post(host,source+'/members',{'name':f'Member {i}','phone':f'090678901{i}','kind':'fixed','gender':gender},source)
        yield host,club_id,email


def png():
    image=Image.new('RGB',(120,120),'white');out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


def single_game(host,club_id):
    response=post(host,f'/clubs/{club_id}/games',{'title':'Single game','starts_at':'2027-01-07T19:00',
                    'capacity':2,'fixed_fee':30000,'guest_fee':70000},f'/clubs/{club_id}')
    return int(response.url.path.split('/')[-1])


def test_sidebar_workspaces_filters_and_finance_monthly_generation(setup):
    host,club_id,email=setup
    for path in ['/dashboard','/clubs','/schedule','/members','/finance','/account',f'/clubs/{club_id}/settings',
                 '/schedule?club_id=&status=','/members?club_id=&gender=','/finance?club_id=&period=']:
        response=host.get(path);assert response.status_code==200,(path,response.text[:150])
        assert 'id="host-sidebar"' in response.text
    post(host,f'/clubs/{club_id}/monthly-prices',{'monthly_fee':300000,'monthly_fee_female':250000},f'/clubs/{club_id}/settings')
    for _ in range(2):post(host,f'/clubs/{club_id}/dues/bulk',{'period':'2027-01'},'/finance')
    with SessionLocal() as db:
        ids=select(Member.id).where(Member.club_id==club_id)
        dues=db.scalars(select(MonthlyDue).where(MonthlyDue.member_id.in_(ids))).all()
        assert len(dues)==2 and sorted(d.amount for d in dues)==[250000,300000]
    assert '550.000đ' in host.get(f'/finance?club_id={club_id}').text
    assert host.get(f'/finance/export.csv?club_id={club_id}').status_code==200


def test_weekly_generation_rsvp_capacity_cancel_and_private_keys(setup):
    host,club_id,email=setup
    start=(now_local()+timedelta(days=14)).strftime('%Y-%m-%dT19:00')
    response=post(host,'/workspace/games',{'club_id':club_id,'title':'Weekly rule','starts_at':start,'capacity':1,
        'weeks':4,'rsvp_hours':24,'fixed_fee':30000,'guest_fee':70000},'/schedule')
    assert response.status_code==200,response.text[:200]
    with SessionLocal() as db:
        games=db.scalars(select(GameSession).where(GameSession.club_id==club_id)).all()
        assert len(games)==4
        game=games[0];rule_id=game.recurring_rule_id
        bookings=db.scalars(select(Booking).where(Booking.session_id==game.id).order_by(Booking.id)).all()
        assert len(bookings)==2 and all(b.status=='invited' and len(b.access_key)>=24 for b in bookings)
    post(host,f'/rules/{rule_id}/generate',{},'/schedule')
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(GameSession).where(GameSession.club_id==club_id))==4
    with TestClient(app) as player:
        public=f'/join/{game.public_id}'
        assert 'data-phone-lookup' not in player.get(public).text
        first='/attend/'+bookings[0].access_key;second='/attend/'+bookings[1].access_key
        assert post(player,first+'/rsvp',{'action':'yes'},first).status_code==200
        assert post(player,second+'/rsvp',{'action':'yes'},second).status_code==200
        with SessionLocal() as db:assert [db.get(Booking,b.id).status for b in bookings]==['confirmed','waitlist']
        assert post(player,first+'/cancel',{},first).status_code==200
        with SessionLocal() as db:assert db.get(Booking,bookings[1].id).status=='confirmed'
        assert player.get('/attend/short').status_code==404


def test_private_qr_proof_manual_review_and_role_separation(setup):
    host,club_id,email=setup;settings=f'/clubs/{club_id}/settings'
    response=host.post(f'/clubs/{club_id}/payment-settings',data={'csrf':token(host.get(settings)),'bank_name':'Test bank'},files={'qr':('qr.png',png(),'image/png')},follow_redirects=False)
    assert response.status_code==303
    game_id=single_game(host,club_id)
    with SessionLocal() as db:member=db.scalar(select(Member).where(Member.club_id==club_id))
    post(host,f'/games/{game_id}/fixed',{'member_id':member.id},f'/games/{game_id}')
    with SessionLocal() as db:booking=db.scalar(select(Booking).where(Booking.session_id==game_id));old_qr=booking.qr_key
    link='/attend/'+booking.access_key
    with TestClient(app) as player:
        assert player.get(link+'/qr').status_code==200
        assert player.get(f'/clubs/{club_id}/qr').status_code==401
        response=player.post(link+'/proof',data={'csrf':token(player.get(link))},files={'proof':('proof.png',png(),'image/png')},follow_redirects=False)
        assert response.status_code==303
        with SessionLocal() as db:
            saved=db.get(Booking,booking.id);assert not saved.paid and saved.payment_status=='reported'
            proof=db.scalar(select(PaymentProof).where(PaymentProof.booking_id==booking.id))
        assert player.get(f'/proofs/{proof.id}/image').status_code==401
        with TestClient(app) as other:
            other_email=signup(other)
            post(host,f'/clubs/{club_id}/cohosts',{'email':other_email,'role':'manager'},settings)
            assert other.get(f'/clubs/{club_id}').status_code==200
            assert other.get(f'/proofs/{proof.id}/image').status_code==403
            denied=post(other,f'/games/{game_id}/bookings/{booking.id}/paid',{},'/dashboard')
            assert denied.status_code==403
            post(host,f'/clubs/{club_id}/cohosts',{'email':other_email,'role':'finance'},settings)
            assert other.get(f'/proofs/{proof.id}/image').status_code==200
            assert post(other,f'/proofs/{proof.id}/review',{'action':'confirm'},'/payments/review').status_code==200
            assert post(other,f'/proofs/{proof.id}/review',{'action':'confirm'},'/payments/review').status_code==409
        with SessionLocal() as db:assert db.get(Booking,booking.id).paid
    post(host,f'/clubs/{club_id}/payment-settings/remove-qr',{},settings)
    with SessionLocal() as db:
        assert db.get(Club,club_id).qr_key is None
        assert db.get(Booking,booking.id).qr_key==old_qr
    assert host.get(f'/payments/review?club_id={club_id}').status_code==200


def test_bad_image_is_rejected_without_creating_asset(setup):
    host,club_id,email=setup;source=f'/clubs/{club_id}/settings'
    for body in [b'<svg><script>bad()</script></svg>',b'x'*(2*1024*1024+1)]:
        response=host.post(f'/clubs/{club_id}/payment-settings',data={'csrf':token(host.get(source))},files={'qr':('fake.png',body,'image/png')})
        assert response.status_code==400
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(StoredAsset).where(StoredAsset.club_id==club_id))==0


def test_password_change_invalidates_other_sessions_and_one_use_reset(setup):
    host,club_id,email=setup
    with TestClient(app) as other:
        post(other,'/login',{'email':email,'password':'long-strong-test-password'},'/login')
        response=post(host,'/account/password',{'current_password':'long-strong-test-password','password':'new-test-password-123','confirm_password':'new-test-password-123'},'/account')
        assert response.status_code==200
        assert other.get('/dashboard').status_code==401
        with SessionLocal.begin() as db:
            user=db.scalar(select(Host).where(Host.email==email));raw=new_token(db,user,'reset')
        source='/reset-password?token='+raw
        response=post(other,'/reset-password',{'token':raw,'password':'another-test-password-123','confirm_password':'another-test-password-123'},source)
        assert response.status_code==200
        assert other.get(source).status_code==400
        assert host.get('/dashboard').status_code==401


def test_admin_requires_a_verified_email_and_explicit_allowlist(setup,monkeypatch):
    host,club_id,email=setup;monkeypatch.setenv('ADMIN_EMAILS',email)
    assert host.get('/admin').status_code==403
    with SessionLocal.begin() as db:
        user=db.scalar(select(Host).where(Host.email==email));raw=new_token(db,user,'verify')
    response=post(host,'/verify-email',{'token':raw},'/verify-email?token='+raw)
    assert response.status_code==200
    assert host.get('/admin').status_code==200
    assert post(host,f'/admin/clubs/{club_id}/trial',{'days':60},'/admin').status_code==200


def test_gender_quota_rsvp_and_waitlist_promote_only_eligible_players(setup):
    host,club_id,email=setup;club_path=f'/clubs/{club_id}'
    for i,gender in enumerate(['male','female']):
        post(host,club_path+'/members',{'name':f'Extra {gender}','phone':f'090555100{i}',
            'kind':'fixed','gender':gender},club_path)
    start=(now_local()+timedelta(days=14)).strftime('%Y-%m-%dT19:00')
    response=post(host,'/workspace/games',{'club_id':club_id,'title':'Quota test','starts_at':start,
        'capacity':3,'capacity_male':1,'capacity_female':2,'weeks':2,'rsvp_hours':24},'/schedule')
    assert response.status_code==200
    with SessionLocal() as db:
        game=db.scalar(select(GameSession).where(GameSession.club_id==club_id).order_by(GameSession.id))
        bookings=db.scalars(select(Booking).where(Booking.session_id==game.id).order_by(Booking.id)).all()
        assert game.capacity_male==1 and game.capacity_female==2
    with TestClient(app) as player:
        for booking in bookings:
            path='/attend/'+booking.access_key
            assert post(player,path+'/rsvp',{'action':'yes'},path).status_code==200
        with SessionLocal() as db:
            assert [db.get(Booking,b.id).status for b in bookings]==['confirmed','confirmed','waitlist','confirmed']
        # Freeing a female place cannot overfill the male quota.
        path='/attend/'+bookings[1].access_key
        post(player,path+'/cancel',{},path)
        with SessionLocal() as db:assert db.get(Booking,bookings[2].id).status=='waitlist'
        # Host cancellation also promotes the eligible waiting player.
        game_path=f'/games/{game.id}'
        post(host,f'{game_path}/bookings/{bookings[0].id}/cancel',{},game_path)
        with SessionLocal() as db:assert db.get(Booking,bookings[2].id).status=='confirmed'
        assert post(host,game_path+'/settings',{'title':'Quota test','starts_at':start,'capacity':3,
                    'capacity_male':0,'capacity_female':2},game_path).status_code==400


def test_recurring_extend_stop_and_invitation_idempotence(setup):
    host,club_id,email=setup
    start=(now_local()+timedelta(days=14)).strftime('%Y-%m-%dT19:00')
    post(host,'/workspace/games',{'club_id':club_id,'title':'Extend test','starts_at':start,'capacity':10,'weeks':2},'/schedule')
    with SessionLocal() as db:game=db.scalar(select(GameSession).where(GameSession.club_id==club_id));rule=game.recurring_rule_id
    assert post(host,f'/rules/{rule}/extend',{'weeks':2},'/schedule').status_code==200
    assert post(host,f'/rules/{rule}/generate',{},'/schedule').status_code==200
    for _ in range(2):post(host,f'/games/{game.id}/invite-fixed',{},f'/games/{game.id}')
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(GameSession).where(GameSession.recurring_rule_id==rule))==4
        assert db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==game.id))==2
    assert post(host,f'/rules/{rule}/stop',{},'/schedule').status_code==200
    assert post(host,f'/rules/{rule}/extend',{'weeks':1},'/schedule').status_code==400


def test_monthly_proof_rejection_resubmission_and_confirm(setup):
    host,club_id,email=setup
    post(host,f'/clubs/{club_id}/dues/bulk',{'period':'2027-02'},'/finance')
    with SessionLocal() as db:
        due=db.scalar(select(MonthlyDue).join(Member,MonthlyDue.member_id==Member.id).where(Member.club_id==club_id))
    path='/dues/pay/'+due.access_key
    with TestClient(app) as player:
        for action in ('reject','confirm'):
            assert player.post(path+'/proof',data={'csrf':token(player.get(path))},
                files={'proof':('proof.png',png(),'image/png')},follow_redirects=False).status_code==303
            with SessionLocal() as db:
                proof=db.scalar(select(PaymentProof).where(PaymentProof.due_id==due.id,PaymentProof.status=='reported'))
                assert not db.get(MonthlyDue,due.id).paid
            assert post(host,f'/proofs/{proof.id}/review',{'action':action,'note':'Checked'},'/payments/review').status_code==200
        with SessionLocal() as db:assert db.get(MonthlyDue,due.id).paid


def test_browser_errors_are_readable_and_do_not_echo_passwords():
    with TestClient(app) as client:
        response=client.get('/attend/short',headers={'Accept':'text/html'})
        assert response.status_code==404 and '<html' in response.text
        response=client.post('/reset-password',data={'password':'do-not-echo-me'},headers={'Accept':'text/html'})
        assert response.status_code==400 and 'do-not-echo-me' not in response.text

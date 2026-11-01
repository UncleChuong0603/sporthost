import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from test_group_bookings import context, game, register, booking, post
from app.main import app, SessionLocal, Booking, BookingParticipant, GameSession, Member, AuditLog, confirm_count
from app.workspace import now_local
from app.main import ClubAccess,Host


def people(game_id):
    with SessionLocal() as db:
        return db.scalars(select(BookingParticipant).join(Booking).where(Booking.session_id==game_id)
                          .order_by(BookingParticipant.id)).all()


def mark(host, game_id, person, action, **data):
    return post(host,f'/games/{game_id}/participants/{person.id}/attendance',
                {'action':action,'version':person.attendance_version,**data},f'/games/{game_id}')


def test_partial_group_attendance_no_show_walk_in_and_early_exit(context):
    host, guest, club = context
    game_id, public = game(context,capacity=3,mode='AUTO_APPROVE')
    register(guest,public,3)
    path=f'/games/{game_id}'
    assert post(host,path+'/lifecycle/start',{},path).status_code==200
    assert 'data-phone-lookup' not in guest.get(public).text
    first,second,third=people(game_id)
    assert mark(host,game_id,first,'check_in').status_code==200
    assert mark(host,game_id,second,'check_in').status_code==200
    assert mark(host,game_id,third,'no_show').status_code==200
    saved=booking(game_id)
    assert not saved.attended and saved.fee_amount==210000
    response=post(host,path+'/walk-ins',{'name':'Khách tới sân','phone':'0903334445'},path)
    assert response.status_code==200
    players=people(game_id)
    assert len(players)==4 and players[-1].attendance_status=='CHECKED_IN'
    with SessionLocal() as db:
        assert confirm_count(db,game_id)==3
    second=players[1]
    assert mark(host,game_id,second,'check_out').status_code==200
    assert people(game_id)[1].left_at
    response=host.get(path)
    assert 'Khách tới sân' in response.text and 'Đã đến sân' in response.text and 'Đang ở sân' in response.text
    assert mark(host,game_id,people(game_id)[2],'check_in').status_code==409


def test_version_conflict_idempotent_retry_and_explicit_correction_reason(context):
    host,guest,club=context
    game_id,public=game(context,mode='AUTO_APPROVE')
    register(guest,public,1)
    original=people(game_id)[0]
    assert mark(host,game_id,original,'check_in').status_code==200
    assert mark(host,game_id,original,'check_in').status_code==200
    assert people(game_id)[0].attendance_version==1
    assert mark(host,game_id,original,'no_show',reason='Sai người').status_code==409
    fresh=people(game_id)[0]
    assert mark(host,game_id,fresh,'reset').status_code==400
    assert mark(host,game_id,fresh,'reset',reason='Host chọn nhầm').status_code==200
    restored=people(game_id)[0]
    assert restored.attendance_status=='NOT_MARKED' and restored.arrived_at is None
    with SessionLocal() as db:
        logs=db.scalars(select(AuditLog).where(AuditLog.club_id==club,AuditLog.action=='Điểm danh người chơi')).all()
        assert len(logs)==2
        assert json.loads(logs[-1].details)['reason']=='Host chọn nhầm'


def test_session_finish_is_not_paid_or_settled_and_reopen_requires_reason(context):
    host,guest,club=context
    game_id,public=game(context,mode='AUTO_APPROVE')
    register(guest,public,1)
    path=f'/games/{game_id}'
    assert post(host,path+'/lifecycle/finish',{},path).status_code==409
    for action in ('start','start','finish','finish'):
        assert post(host,path+'/lifecycle/'+action,{},path).status_code==200
    with SessionLocal() as db:
        session=db.get(GameSession,game_id)
        assert session.lifecycle_status=='PLAY_FINISHED' and not session.is_open
        assert not db.get(Booking,booking(game_id).id).paid
    assert post(host,path+'/walk-ins',{'name':'Late','phone':'0903334445'},path).status_code==409
    assert post(host,path+'/lifecycle/reopen',{},path).status_code==400
    assert post(host,path+'/lifecycle/reopen',{'reason':'Bổ sung kết quả thực tế'},path).status_code==200
    with SessionLocal.begin() as db:
        db.get(GameSession,game_id).attendance_locked=True
    assert mark(host,game_id,people(game_id)[0],'check_in').status_code==409
    assert post(host,path+'/cancel',{},path).status_code==409


def test_walk_in_capacity_tenant_scope_and_duplicate_phone(context):
    host,guest,club=context
    game_id,public=game(context,capacity=1,mode='AUTO_APPROVE')
    register(guest,public,1)
    path=f'/games/{game_id}'
    assert post(host,path+'/walk-ins',{'name':'No slot','phone':'0903334445'},path).status_code==409
    with SessionLocal() as db:
        assert db.scalar(select(Member).where(Member.club_id==club,Member.phone=='0903334445')) is None
    assert mark(host,game_id,people(game_id)[0],'no_show').status_code==200
    for _ in range(2):
        assert post(host,path+'/walk-ins',{'name':'Walk in','phone':'0903334445'},path).status_code==200
    assert len(people(game_id))==2
    other,_=game(context)
    assert mark(host,other,people(game_id)[0],'check_in').status_code==404
    assert post(guest,path+'/walk-ins',{'name':'Hacked','phone':'0904445556'},public).status_code==401


def test_replacement_and_any_attendance_block_guest_party_edit(context):
    host,guest,club=context
    game_id,public=game(context,mode='AUTO_APPROVE')
    register(guest,public,3)
    record=booking(game_id); first=people(game_id)[0]
    assert mark(host,game_id,first,'check_in').status_code==200
    link='/attend/'+record.access_key
    assert post(guest,link+'/edit',{'companion_name':['Khác']},link).status_code==409
    path=f'/games/{game_id}'
    target=people(game_id)[1]
    result=post(host,f'{path}/participants/{target.id}/replace',{'name':'Người thay thế','gender':'female',
                'reason':'Bạn cũ bận','version':target.attendance_version},path)
    assert result.status_code==200
    changed=people(game_id)[1]
    assert changed.name=='Người thay thế' and changed.attendance_status=='NOT_MARKED' and changed.member_id is None
    assert booking(game_id).fee_amount==210000
    assert post(host,f'{path}/participants/{target.id}/replace',{'name':'Stale','reason':'retry','version':0},path).status_code==409


def test_cohost_roles_and_cancelled_session_backend_guards(context):
    import secrets
    host,guest,club=context
    game_id,public=game(context,mode='AUTO_APPROVE')
    register(guest,public,1)
    path=f'/games/{game_id}'
    with TestClient(app) as cohost:
        email=f'attendance-cohost-{secrets.token_hex(8)}@example.com'
        post(cohost,'/signup',{'email':email,'password':'attendance-cohost-password'},'/signup')
        settings=f'/clubs/{club}/settings'
        post(host,f'/clubs/{club}/cohosts',{'email':email,'role':'finance'},settings)
        assert mark(cohost,game_id,people(game_id)[0],'check_in').status_code==403
        post(host,f'/clubs/{club}/cohosts',{'email':email,'role':'manager'},settings)
        assert mark(cohost,game_id,people(game_id)[0],'check_in').status_code==200
        with SessionLocal() as db:
            person=db.get(BookingParticipant,people(game_id)[0].id)
            actor=db.scalar(select(Host).where(Host.email==email))
            assert person.attendance_actor_id==actor.id
    post(host,path+'/cancel',{},path)
    assert mark(host,game_id,people(game_id)[0],'reset',reason='Không được phép').status_code==409

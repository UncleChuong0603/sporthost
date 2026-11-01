import json
import secrets
from fastapi.testclient import TestClient
from sqlalchemy import select,func

from test_group_bookings import context,post,booking
from test_billing import finished,issue,receipt
from app.main import (app,SessionLocal,Host,GameSession,ChargeBatch,Charge,ChargeAdjustment,
                      MoneyMovement,ClubAccess,AuditLog,PlatformLedgerEntry)
from app.finance_service import balances,summary


def test_close_unpaid_collect_after_close_adjust_and_preserve_original(context):
    host,guest,club=context;gid,record=finished(context,size=2);issue(host,gid)
    path=f'/games/{gid}/billing'
    assert post(host,path+'/close',{},path).status_code==200
    assert post(host,path+'/close',{},path).status_code==200
    with SessionLocal() as db:
        game=db.get(GameSession,gid);batch=db.scalar(select(ChargeBatch).where(ChargeBatch.session_id==gid))
        charge=db.scalar(select(Charge).where(Charge.batch_id==batch.id))
        assert game.lifecycle_status=='SETTLED' and batch.closed_at
        assert summary(balances(db,game))['outstanding']==140000
        original=batch.snapshot
    assert receipt(host,gid,record,100000,source='CASH').status_code==200
    data={'charge_id':charge.id,'amount':-10000,'version':1,'reason':'Host giảm phí','request_key':secrets.token_hex(12)}
    assert post(host,path+'/adjustments',data,path).status_code==200
    assert post(host,path+'/adjustments',data,path).status_code==200
    assert post(host,path+'/adjustments',{**data,'request_key':secrets.token_hex(12)},path).status_code==409
    assert post(host,path+'/adjustments',{**data,'version':2,'amount':-999999,'request_key':secrets.token_hex(12)},path).status_code==400
    with SessionLocal() as db:
        assert db.get(Charge,charge.id).amount==70000
        assert db.get(ChargeBatch,batch.id).snapshot==original
        assert db.get(ChargeBatch,batch.id).version==2
        assert summary(balances(db,db.get(GameSession,gid)))['outstanding']==30000
        assert db.scalar(select(func.count()).select_from(ChargeAdjustment).where(ChargeAdjustment.batch_id==batch.id))==1
        assert len(db.scalars(select(AuditLog).where(AuditLog.club_id==club,AuditLog.action=='Chốt sổ buổi đánh')).all())==1
    private=guest.get('/attend/'+record.access_key)
    assert '130.000đ' in private.text or '60.000đ' in private.text
    assert '30.000đ' in private.text


def cohost(context,rights):
    host,_,club=context
    client=TestClient(app);email=secrets.token_hex(10)+'@example.com'
    post(client,'/signup',{'email':email,'password':'cohost-password'},'/signup')
    assert post(host,f'/clubs/{club}/cohosts',{'email':email,'role':'custom','permissions':rights},f'/clubs/{club}/settings').status_code==200
    return client,email


def test_granular_checkin_cannot_read_finance_contact_private_links_or_mutate_other_areas(context):
    host,guest,club=context;gid,record=finished(context,size=1)
    # Reopen to exercise check-in while finance remains inaccessible.
    post(host,f'/games/{gid}/lifecycle/reopen',{'reason':'Test permissions'},f'/games/{gid}')
    checker,email=cohost(context,['check_in'])
    try:
        view=checker.get(f'/games/{gid}');assert view.status_code==200
        assert '0902345678' not in view.text and '/attend/' not in view.text
        assert 'Đã thu theo buổi' not in view.text and 'Phí / Thanh toán' not in view.text
        assert checker.get(f'/games/{gid}/billing').status_code==403
        assert checker.get(f'/games/{gid}/export.csv').status_code==403
        assert checker.get(f'/members?club_id={club}').status_code==403
        assert '/dues/pay/' not in checker.get(f'/clubs/{club}').text
        assert post(checker,f'/games/{gid}/participants/{record.participants[0].id}/attendance',
            {'action':'check_out','version':1},f'/games/{gid}').status_code==200
        assert post(checker,f'/games/{gid}/lifecycle/finish',{},f'/games/{gid}').status_code==403
        assert post(checker,f'/games/{gid}/walk-ins',{'name':'No permission','phone':'0905554443'},f'/games/{gid}').status_code==403
        assert post(checker,f'/games/{gid}/bookings/{record.id}/private-link/rotate',{},f'/games/{gid}').status_code==403
        assert post(checker,f'/clubs/{club}/settings',{'name':'Cannot'},f'/clubs/{club}/settings').status_code==403
        assert 'Đã thu' not in checker.get('/admin').text
    finally:checker.close()


def test_custom_finance_settings_permissions_and_revocation(context):
    host,guest,club=context;gid,record=finished(context,size=1)
    finance,email=cohost(context,['manage_finance'])
    try:
        assert finance.get(f'/games/{gid}/billing').status_code==200
        assert issue(finance,gid).status_code==200
        assert post(finance,f'/games/{gid}/billing/close',{},f'/games/{gid}/billing').status_code==200
        assert receipt(finance,gid,record,10000).status_code==200
        assert post(finance,f'/games/{gid}/participants/{record.participants[0].id}/attendance',
            {'action':'reset','version':1,'reason':'No'},f'/games/{gid}').status_code==403
        with SessionLocal() as db:
            access=db.scalar(select(ClubAccess).join(Host).where(ClubAccess.club_id==club,Host.email==email))
        assert post(host,f'/clubs/{club}/cohosts/{access.id}/remove',{},f'/clubs/{club}/settings').status_code==200
        assert finance.get(f'/games/{gid}/billing').status_code==404
    finally:finance.close()
    editor,email=cohost(context,['edit_club_settings'])
    try:
        assert post(editor,f'/clubs/{club}/settings',{'name':'CLB sửa hợp lệ'},f'/clubs/{club}/settings').status_code==200
        assert post(editor,f'/clubs/{club}/cohosts',{'email':email,'role':'manager'},f'/clubs/{club}/settings').status_code==403
        assert editor.get(f'/clubs/{club}/qr').status_code==403
    finally:editor.close()


def test_platform_ledger_admin_only_history_and_no_club_side_effect(context):
    host,guest,club=context;gid,record=finished(context,size=1);issue(host,gid)
    assert host.get('/admin/platform-ledger').status_code==403
    with SessionLocal.begin() as db:
        # context owns the only club created in this test; identify without relying on global IDs.
        from app.main import Club
        db.get(Host,db.get(Club,club).owner_id).is_platform_admin=True
    data={'entry_date':'2026-11-01','direction':'INCOME','category':'Phí phần mềm','amount':99000,
          'note':'Ghi nội bộ','request_key':secrets.token_hex(12)}
    source='/admin/platform-ledger'
    assert post(host,source,data,source).status_code==200
    assert post(host,source,data,source).status_code==200
    with SessionLocal() as db:
        entry=db.scalar(select(PlatformLedgerEntry).where(PlatformLedgerEntry.request_key==data['request_key']))
        assert summary(balances(db,db.get(GameSession,gid)))['outstanding']==70000
        assert len(db.scalars(select(MoneyMovement).where(MoneyMovement.session_id==gid)).all())==0
    change={k:v for k,v in data.items() if k!='request_key'};change.update(amount=90000,reason='Sửa ghi nhầm',version=0)
    assert post(host,f'{source}/{entry.id}/edit',change,source).status_code==200
    assert post(host,f'{source}/{entry.id}/edit',change,source).status_code==409
    assert '90.000đ' in host.get(source+'?period=2026-11').text
    with SessionLocal() as db:
        log=db.scalar(select(AuditLog).where(AuditLog.action=='Sửa sổ nền tảng').order_by(AuditLog.id.desc()))
        details=json.loads(log.details)
        assert details['before']['amount']==99000 and details['after']['amount']==90000 and log.club_id is None
    assert post(host,f'/games/{gid}/billing/adjustments',{'charge_id':999999,'amount':1,'version':1,
        'reason':'Cross ID','request_key':secrets.token_hex(12)},f'/games/{gid}/billing').status_code==404

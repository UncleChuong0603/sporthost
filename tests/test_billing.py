import io
import json
import re
import secrets

from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import select, func

from test_group_bookings import context, game, register, booking, post, csrf
from app.main import (app, SessionLocal, GameSession, Booking, BookingParticipant, ChargeBatch,
                      Charge, MoneyMovement, Expense, Member, MonthlyDue, PaymentProof)
from app.finance_service import draft, fingerprint, balances, summary


def finished(context, size=3, **policy):
    host, guest, _ = context
    game_id, public = game(context, mode='AUTO_APPROVE', **policy)
    register(guest, public, size)
    record = booking(game_id);path=f'/games/{game_id}'
    post(host,path+'/lifecycle/start',{},path)
    for person in record.participants:
        assert post(host,f'{path}/participants/{person.id}/attendance',{'action':'check_in','version':0},path).status_code==200
    post(host,path+'/lifecycle/finish',{},path)
    return game_id, record


def issue(host, game_id, expected=None):
    path=f'/games/{game_id}'
    if expected is None:
        with SessionLocal() as db:expected=fingerprint(draft(db,db.get(GameSession,game_id)))
    return post(host,path+'/billing/issue',{'draft_hash':expected},path+'/billing')


def receipt(host, game_id, record, amount, **extra):
    return post(host,f'/games/{game_id}/billing/bookings/{record.id}/money',
                {'amount':amount,'kind':'RECEIVED','source':'BANK_TRANSFER',
                 'request_key':secrets.token_hex(12),**extra},f'/games/{game_id}/billing')


def image_bytes(color='red'):
    output=io.BytesIO();Image.new('RGB',(12,12),color).save(output,format='PNG');return output.getvalue()


def test_exact_aa_rounding_issue_retry_and_locked_basis(context):
    host,guest,club=context
    game_id,record=finished(context,fee_mode='COST_SHARING');path=f'/games/{game_id}'
    assert post(host,path+'/expenses',{'title':'Tiền sân','amount':100001,'category':'COURT'},path).status_code==200
    with SessionLocal() as db:
        preview=draft(db,db.get(GameSession,game_id));old_hash=fingerprint(preview)
        assert [p['amount'] for p in preview['people']]==[33334,33334,33333]
        assert preview['total_due']==100001
    post(host,path+'/expenses',{'title':'CLB bù','amount':10000,'allocated':'false'},path)
    assert issue(host,game_id,old_hash).status_code==409
    assert issue(host,game_id).status_code==200
    assert issue(host,game_id,'retry-old-hash').status_code==200
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ChargeBatch).where(ChargeBatch.session_id==game_id))==1
        batch=db.scalar(select(ChargeBatch).where(ChargeBatch.session_id==game_id))
        assert json.loads(batch.snapshot)['excluded_expenses']==10000
        snapshot=batch.snapshot
    assert post(host,path+'/expenses',{'title':'Không đổi','amount':999},path).status_code==409
    assert post(host,f'{path}/participants/{record.participants[0].id}/attendance',{'action':'no_show','version':1,'reason':'test'},path).status_code==409
    assert post(host,path+'/billing/bookings/'+str(record.id)+'/payer',{'mode':'SPLIT'},path).status_code==409
    with SessionLocal() as db:assert db.get(ChargeBatch,batch.id).snapshot==snapshot
    assert '100.001đ' in guest.get('/attend/'+record.access_key).text
    assert '100.001đ' in host.get(path).text
    assert '100001' in host.get(path+'/export.csv').text


def test_partial_bank_cash_overpayment_refund_reversal_and_no_boolean_bypass(context):
    host,guest,club=context;game_id,record=finished(context,size=1)
    assert issue(host,game_id).status_code==200
    key=secrets.token_hex(12)
    assert receipt(host,game_id,record,30000,request_key=key).status_code==200
    assert receipt(host,game_id,record,30000,request_key=key).status_code==200
    assert receipt(host,game_id,record,31000,request_key=key).status_code==409
    with SessionLocal() as db:
        state=summary(balances(db,db.get(GameSession,game_id)))
        assert state['net']==30000 and state['outstanding']==40000 and not db.get(Booking,record.id).paid
    assert receipt(host,game_id,record,50000,source='CASH').status_code==200
    assert 'Thừa / cần hoàn' in guest.get('/attend/'+record.access_key).text
    assert receipt(host,game_id,record,10000,kind='REFUND_RECORDED',reason='Hoàn tiền thừa').status_code==200
    assert receipt(host,game_id,record,999999,kind='REFUND_RECORDED',reason='Quá số dư').status_code==409
    assert receipt(host,game_id,record,1,kind='REFUND_RECORDED').status_code==400
    with SessionLocal() as db:
        game_row=db.get(GameSession,game_id);row=balances(db,game_row)[0]
        assert row['net']==70000 and row['outstanding']==row['credit']==0
        refund=db.scalar(select(MoneyMovement).where(MoneyMovement.session_id==game_id,MoneyMovement.kind=='REFUND_RECORDED'))
    assert receipt(host,game_id,record,10000,kind='REVERSAL',reverses_id=refund.id,reason='Ghi nhầm hoàn').status_code==200
    with SessionLocal() as db:
        state=summary(balances(db,db.get(GameSession,game_id)))
        assert state['received']==state['net']==80000 and state['refunded']==0
    assert receipt(host,game_id,record,10000,kind='REVERSAL',reverses_id=refund.id,reason='Lặp').status_code==409
    assert post(host,f'/games/{game_id}/bookings/{record.id}/unpaid',{},f'/games/{game_id}').status_code==409
    assert '80.000đ' in host.get(f'/games/{game_id}').text
    assert '80.000đ' in host.get(f'/finance?club_id={club}').text


def test_split_group_separate_obligations_and_payer_isolation(context):
    host,guest,club=context;game_id,record=finished(context,size=3)
    link='/attend/'+record.access_key
    assert post(guest,link+'/payer',{'mode':'SPLIT'},link).status_code==200
    assert issue(host,game_id).status_code==200
    assert receipt(host,game_id,record,70000).status_code==400
    assert receipt(host,game_id,record,70000,payer_participant_id=record.participants[0].id).status_code==200
    with SessionLocal() as db:
        rows=balances(db,db.get(GameSession,game_id));assert len(rows)==3
        assert summary(rows)['amount']==210000 and summary(rows)['outstanding']==140000
    other_id,other=finished(context,size=1)
    assert receipt(host,game_id,record,1,payer_participant_id=other.participants[0].id).status_code==400


def test_no_show_paid_monthly_late_exit_waiver_and_loss(context):
    host,guest,club=context;game_id,record=finished(context,size=3,fee_mode='COST_SHARING')
    with SessionLocal.begin() as db:
        member=db.get(Member,record.member_id);member.kind='fixed'
        db.add(MonthlyDue(member_id=member.id,period=db.get(GameSession,game_id).starts_at[:7],amount=300000,paid=True))
        db.get(BookingParticipant,record.participants[2].id).attendance_status='NO_SHOW'
        db.get(BookingParticipant,record.participants[1].id).left_at='2026-11-01T12:00:00+00:00'
    post(host,f'/games/{game_id}/expenses',{'title':'Tiền sân','amount':100000},f'/games/{game_id}')
    with SessionLocal() as db:
        value=draft(db,db.get(GameSession,game_id))
        assert [p['amount'] for p in value['people']]==[0,100000,0]
        assert value['billable_count']==1
        assert 'đóng phí tháng' in value['people'][0]['explanation']
    assert post(host,f'/games/{game_id}/billing/participants/{record.participants[1].id}',
        {'discount':25000,'reason':'Host hỗ trợ'},f'/games/{game_id}/billing').status_code==200
    with SessionLocal() as db:assert draft(db,db.get(GameSession,game_id))['total_due']==75000
    assert issue(host,game_id).status_code==200
    with SessionLocal.begin() as db:db.get(Member,record.member_id).kind='guest'
    second_id,second=finished(context,size=1)
    post(host,f'/games/{second_id}/expenses',{'title':'Sân lỗ','amount':90000},f'/games/{second_id}')
    with SessionLocal() as db:
        v=draft(db,db.get(GameSession,second_id));assert v['total_due']-v['total_expenses']==-20000


def test_proofs_are_reports_review_explicit_amount_duplicate_and_multiple_reports(context):
    host,guest,club=context;game_id,record=finished(context,size=1);issue(host,game_id)
    link='/attend/'+record.access_key
    def upload(color):
        return guest.post(link+'/proof',data={'csrf':csrf(guest.get(link)),'reported_amount':'70000'},
                          files={'proof':('proof.png',image_bytes(color),'image/png')},follow_redirects=True)
    assert upload('red').status_code==200
    assert upload('red').status_code==409
    assert upload('blue').status_code==200
    with SessionLocal() as db:
        proofs=db.scalars(select(PaymentProof).where(PaymentProof.booking_id==record.id).order_by(PaymentProof.id)).all()
        assert len(proofs)==2
        assert summary(balances(db,db.get(GameSession,game_id)))['net']==0
        assert not db.get(Booking,record.id).paid
    review=f'/proofs/{proofs[0].id}/review';source=f'/payments/review?club_id={club}'
    assert post(host,review,{'action':'confirm'},source).status_code==400
    assert post(host,review,{'action':'confirm','received_amount':30000},source).status_code==200
    assert post(host,review,{'action':'confirm','received_amount':30000},source).status_code==200
    assert post(host,review,{'action':'confirm','received_amount':70000},source).status_code==409
    assert post(host,f'/proofs/{proofs[1].id}/review',{'action':'reject','note':'Không tìm thấy giao dịch'},source).status_code==200
    with SessionLocal() as db:
        assert summary(balances(db,db.get(GameSession,game_id)))['outstanding']==40000
        assert db.scalar(select(func.count()).select_from(MoneyMovement).where(MoneyMovement.session_id==game_id))==1


def test_issue_requires_finished_attendance_and_cross_tenant_access(context):
    host,guest,club=context;game_id,public=game(context,mode='AUTO_APPROVE');register(guest,public,1)
    assert issue(host,game_id).status_code==409
    path=f'/games/{game_id}'
    post(host,path+'/lifecycle/start',{},path);post(host,path+'/lifecycle/finish',{},path)
    assert issue(host,game_id).status_code==409
    with TestClient(app) as outsider:
        post(outsider,'/signup',{'email':secrets.token_hex(8)+'@example.com','password':'password-test'},'/signup')
        assert outsider.get(path+'/billing').status_code==404
        assert post(outsider,path+'/billing/issue',{'draft_hash':'bad'},'/clubs').status_code==404
    assert guest.get(path+'/billing').status_code==401


def test_qr_and_bank_details_snapshot_together_and_legacy_money_opening_once(context):
    from app.main import Club
    host,guest,club=context;game_id,record=finished(context,size=1)
    # Existing confirmed money is migrated once on issue, with no inference from pictures.
    with SessionLocal.begin() as db:
        c=db.get(Club,club);c.bank_name='Ngân hàng A';c.account_holder='Host A';c.qr_key='private/qr-a.png'
        b=db.get(Booking,record.id);b.paid=True;b.payment_status='confirmed'
    assert issue(host,game_id).status_code==200
    assert issue(host,game_id).status_code==200
    with SessionLocal.begin() as db:
        c=db.get(Club,club);c.bank_name='Ngân hàng B';c.qr_key='private/qr-b.png'
    with SessionLocal() as db:
        batch=db.scalar(select(ChargeBatch).where(ChargeBatch.session_id==game_id))
        assert json.loads(batch.snapshot)['payment']['bank_name']=='Ngân hàng A'
        assert json.loads(batch.snapshot)['payment']['qr_key']=='private/qr-a.png'
        assert summary(balances(db,db.get(GameSession,game_id)))['net']==70000
        assert db.scalar(select(func.count()).select_from(MoneyMovement).where(MoneyMovement.session_id==game_id))==1


def test_published_full_no_show_waiver_zero_billable_and_policy_freeze(context):
    host,guest,club=context;game_id,record=finished(context,size=2,fee_mode='COST_SHARING',no_show_policy='FULL')
    path=f'/games/{game_id}'
    with SessionLocal.begin() as db:db.get(BookingParticipant,record.participants[1].id).attendance_status='NO_SHOW'
    post(host,path+'/expenses',{'title':'Sân','amount':100001},path)
    with SessionLocal() as db:
        value=draft(db,db.get(GameSession,game_id));assert value['billable_count']==2
        assert value['people'][1]['amount']==50000
        current=db.get(GameSession,game_id)
        data={'title':current.title,'starts_at':current.starts_at,'capacity':current.capacity,'fee_mode':'FIXED_PRICE','change_reason':'Đổi ý'}
    assert post(host,path+'/settings',data,path).status_code==409
    for person in record.participants:
        assert post(host,f'{path}/billing/participants/{person.id}',{'exempt':'true','reason':'Host mời'},path+'/billing').status_code==200
    with SessionLocal() as db:
        value=draft(db,db.get(GameSession,game_id));assert value['billable_count']==0
        assert value['unallocated_cost']==100001 and value['total_due']==0
    assert issue(host,game_id).status_code==200


def test_host_receives_waitlisted_group_at_court_without_reopening_public_registration(context):
    host,guest,club=context;game_id,public=game(context,capacity=1,mode='AUTO_APPROVE')
    register(guest,public,1);first=booking(game_id)
    register(guest,public,1,phone='0902345679');waiting=booking(game_id,'0902345679')
    assert waiting.status=='waitlist'
    path=f'/games/{game_id}'
    post(host,path+'/lifecycle/start',{},path)
    post(host,f'{path}/participants/{first.participants[0].id}/attendance',{'action':'no_show','version':0},path)
    assert post(host,f'{path}/bookings/{waiting.id}/approve',{},path).status_code==200
    assert booking(game_id,'0902345679').status=='confirmed'
    with SessionLocal() as db:assert not db.get(GameSession,game_id).is_open

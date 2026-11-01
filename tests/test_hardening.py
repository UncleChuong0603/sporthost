import io
import secrets
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select,func
from sqlalchemy.exc import OperationalError,IntegrityError

from test_group_bookings import context,game,register,post,csrf
from test_guest_lookup import setup_lookup,lookup,token
from test_billing import image_bytes,finished,issue
from app.main import app,SessionLocal,Member,Booking,MoneyMovement,db_session,lookup_signer
from app.storage import sanitize_image
from starlette.datastructures import UploadFile,Headers


def test_lookup_and_signed_payload_do_not_disclose_profiles_or_grant_private_link(setup_lookup):
    host,guest,club,gid,public=setup_lookup
    response=lookup(guest,public,'0901234567')
    payload=lookup_signer.loads(token(response,'lookup_token'))
    assert set(payload)=={'game','phone','version'}
    assert 'Known guest' not in response.text and 'TB khá' not in response.text
    wrong=guest.post(public,data={'phone':'0901234567','name':'Wrong name','csrf':token(response),
                    'lookup_token':token(response,'lookup_token')},follow_redirects=True)
    assert wrong.status_code==409 and 'Known guest' not in wrong.text
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==gid))==0


def test_upload_magic_and_mime_both_required_and_paths_confined():
    from app.storage import local_path
    for mime,data in [('image/jpeg',image_bytes()),('text/html',image_bytes()),('image/png',b'<script>bad</script>')]:
        upload=UploadFile(file=io.BytesIO(data),filename='anything.png',headers=Headers({'content-type':mime}))
        try:sanitize_image(upload)
        except HTTPException as error:assert error.status_code==400
        else:raise AssertionError('Invalid image was accepted')
    try:local_path('../../outside.txt')
    except ValueError:pass
    else:raise AssertionError('Escaped upload directory')
    with TestClient(app) as client:
        response=client.post('/signup',content=b'',headers={'content-length':str(6*1024*1024)})
        assert response.status_code==413


def test_database_failure_safe_message_and_no_partial_money_then_retry(context,monkeypatch):
    host,guest,club=context;gid,record=finished(context,size=1);issue(host,gid)
    data={'amount':10000,'kind':'RECEIVED','source':'CASH','request_key':secrets.token_hex(12)}
    source=f'/games/{gid}/billing';form_csrf=csrf(host.get(source))
    def unavailable():
        raise OperationalError('postgres://private-password@server/database',{},Exception('private-password'))
        yield
    app.dependency_overrides[db_session]=unavailable
    try:
        response=host.post(f'{source}/bookings/{record.id}/money',data={**data,'csrf':form_csrf},headers={'Accept':'text/html'})
        assert response.status_code==503 and 'private-password' not in response.text and 'postgres' not in response.text
        assert response.headers['retry-after']=='5'
    finally:app.dependency_overrides.pop(db_session,None)
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(MoneyMovement).where(MoneyMovement.session_id==gid))==0
    from app import finance_service
    original=finance_service.sync_legacy
    def fail_after_money_flush(*args):
        raise OperationalError('private SQL values',{},Exception('private-password'))
    monkeypatch.setattr(finance_service,'sync_legacy',fail_after_money_flush)
    failed=host.post(f'{source}/bookings/{record.id}/money',data={**data,'csrf':form_csrf})
    assert failed.status_code==503 and 'private-password' not in failed.text
    monkeypatch.setattr(finance_service,'sync_legacy',original)
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(MoneyMovement).where(MoneyMovement.session_id==gid))==0
    for _ in range(2):assert post(host,f'{source}/bookings/{record.id}/money',data,source).status_code==200
    with SessionLocal() as db:assert db.scalar(select(func.count()).select_from(MoneyMovement).where(MoneyMovement.session_id==gid))==1


def test_xss_escaped_in_group_policy_and_private_pages(context):
    host,guest,club=context;gid,public=game(context,mode='AUTO_APPROVE',participation_conditions='<script>alert(1)</script>')
    register(guest,public,1)
    response=guest.get(public)
    assert '<script>alert(1)</script>' not in response.text and '&lt;script&gt;alert(1)&lt;/script&gt;' in response.text


def test_monthly_and_unissued_booking_qr_bank_details_stay_together(context):
    from app.main import Club,MonthlyDue
    host,guest,club=context;settings=f'/clubs/{club}/settings'
    def configure(color,bank):
        response=host.post(f'/clubs/{club}/payment-settings',data={'csrf':csrf(host.get(settings)),
            'bank_name':bank,'account_holder':bank+' holder'},files={'qr':('qr.png',image_bytes(color),'image/png')})
        assert response.status_code in (200,303)
    configure('red','Bank A')
    gid,public=game(context,mode='AUTO_APPROVE');register(guest,public,1)
    with SessionLocal() as db:record=db.scalar(select(Booking).where(Booking.session_id==gid))
    post(host,f'/clubs/{club}/members',{'name':'Monthly','phone':'0908887776','kind':'fixed'},f'/clubs/{club}')
    post(host,f'/clubs/{club}/dues/bulk',{'period':'2026-11'},'/finance')
    with SessionLocal() as db:
        due=db.scalar(select(MonthlyDue).join(Member).where(Member.club_id==club))
        old_qr=guest.get('/attend/'+record.access_key+'/qr').content
    configure('blue','Bank B')
    for path in ('/attend/'+record.access_key,'/dues/pay/'+due.access_key):
        page=guest.get(path)
        assert 'Bank A' in page.text and 'Bank B' not in page.text
        assert guest.get(path+'/qr').content==old_qr
    # Legacy rows with no recoverable bank version do not show a mismatched image/text pair.
    with SessionLocal.begin() as db:db.get(MonthlyDue,due.id).payment_snapshot='{}'
    page=guest.get('/dues/pay/'+due.access_key)
    assert 'xác minh trước khi chuyển khoản' in page.text and 'Bank B' not in page.text
    assert guest.get('/dues/pay/'+due.access_key+'/qr').status_code==404

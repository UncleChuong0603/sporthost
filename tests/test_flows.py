import os
import re
import tempfile

_test_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_test_db.close()
os.environ['DATABASE_URL'] = 'sqlite:///' + _test_db.name
os.environ['SECRET_KEY'] = 'test-only-secret-value-for-isolated-local-tests'
from fastapi.testclient import TestClient
from app.main import app


def form_token(response):
    m = re.search(r'name="csrf" value="([^"]+)"', response.text)
    assert m, 'CSRF input missing'
    return m.group(1)


def do_post(client, endpoint, data, source_url):
    token = form_token(client.get(source_url))
    return client.post(endpoint, data={**data, 'csrf':token}, follow_redirects=True)


def sign_up(client,email):
    r = do_post(client,'/signup', {'email':email,'password':'long-strong-test-password'},'/signup')
    assert r.status_code == 200
    assert 'CLB của bạn' in r.text


def create_club(client,name):
    r=do_post(client,'/clubs', {'name':name,'location':'Quận 8'},'/dashboard')
    assert r.status_code==200
    return int(re.search(r'/clubs/(\d+)',r.url.path).group(1))


def add_member(client,club_id,name,phone,kind='fixed'):
    r=do_post(client,f'/clubs/{club_id}/members',{'name':name,'phone':phone,'kind':kind,'level':'TB khá'},f'/clubs/{club_id}')
    assert r.status_code==200


def create_game(client,club_id):
    r=do_post(client,f'/clubs/{club_id}/games',{'title':'Kèo tối thứ 5','venue':'Sân Q8','starts_at':'2026-11-05T19:00','capacity':'2','fixed_fee':'0','guest_fee':'70000'},f'/clubs/{club_id}')
    assert r.status_code==200
    return int(re.search(r'/games/(\d+)',r.url.path).group(1))


def test_full_host_guest_booking_finance_and_tenant_isolation():
    with TestClient(app) as h1, TestClient(app) as h2:
        sign_up(h1,'host1@example.com')
        club_id=create_club(h1,'CLB Q8')
        add_member(h1,club_id,'Minh cố định','0901112223')
        game_id=create_game(h1,club_id)
        r=h1.get(f'/games/{game_id}'); assert r.status_code==200
        public_url=re.search(r'(http://testserver/join/[A-Za-z0-9_-]+)',r.text).group(1)
        member_id=re.search(r'<option value="(\d+)">Minh cố định</option>',r.text).group(1)
        r=do_post(h1,f'/games/{game_id}/fixed',{'member_id':member_id},f'/games/{game_id}')
        assert '1/2' in r.text
        r=do_post(h1,public_url,{'name':'Khách A','phone':'0902223334','level':'TB'},public_url)
        assert 'Đã nhận đăng ký' in r.text
        r=h1.get(f'/games/{game_id}');assert 'Khách A' in r.text
        guest_booking=re.search(r'/games/'+str(game_id)+r'/bookings/(\d+)/approve',r.text).group(1)
        do_post(h1,f'/games/{game_id}/bookings/{guest_booking}/approve',{},f'/games/{game_id}')
        r=h1.get(f'/games/{game_id}');assert '2/2' in r.text
        assert '70.000đ' in r.text
        do_post(h1,f'/games/{game_id}/bookings/{guest_booking}/paid',{},f'/games/{game_id}')
        do_post(h1,f'/games/{game_id}/expenses',{'title':'Tiền sân','amount':'50000'},f'/games/{game_id}')
        r=h1.get(f'/games/{game_id}');assert '20.000đ' in r.text
        assert h1.get(f'/games/{game_id}/export.csv').status_code==200
        # Third applicant remains pending, cannot approve past capacity
        do_post(h1,public_url,{'name':'Khách B','phone':'0902223335','level':'TB'},public_url)
        r=h1.get(f'/games/{game_id}');booking_ids=re.findall(r'/games/'+str(game_id)+r'/bookings/(\d+)/approve',r.text)
        pending_id=booking_ids[0]
        r=do_post(h1,f'/games/{game_id}/bookings/{pending_id}/approve',{},f'/games/{game_id}')
        assert 'Buổi đánh đã đủ' in r.text
        # Another host cannot see/edit club data
        sign_up(h2,'host2@example.com')
        assert h2.get(f'/clubs/{club_id}').status_code==404
        assert h2.get(f'/games/{game_id}').status_code==404
        assert h2.get(f'/games/{game_id}/export.csv').status_code==404
        # CSRF denied on mutating route
        assert h1.post(f'/games/{game_id}/expenses',data={'title':'Test','amount':1,'csrf':'bad'}).status_code==403


def test_password_validation_and_public_close():
    with TestClient(app) as c:
        bad=do_post(c,'/signup',{'email':'invalid','password':'123'},'/signup')
        assert 'Email không hợp lệ' in bad.text
        sign_up(c,'host3@example.com')
        club=create_club(c,'CLB thử')
        game=create_game(c,club)
        r=c.get(f'/games/{game}'); public=re.search(r'(http://testserver/join/[A-Za-z0-9_-]+)',r.text).group(1)
        do_post(c,f'/games/{game}/toggle-open',{},f'/games/{game}')
        r=c.get(public);assert 'chưa nhận đăng ký' in r.text
        r=c.post(public,data={'name':'C','phone':'0903334445','level':'TB','csrf':form_token(c.get(f'/games/{game}'))},follow_redirects=True)
        assert 'chưa nhận đăng ký' in r.text


def test_monthly_dues_duplicates_and_host_login():
    with TestClient(app) as c:
        sign_up(c,'host4@example.com')
        club=create_club(c,'CLB tháng')
        add_member(c,club,'Member Tháng','0909998887')
        member_id=re.search(r'<option value="(\d+)">Member Tháng</option>',c.get(f'/clubs/{club}').text).group(1)
        r=do_post(c,f'/clubs/{club}/dues',{'member_id':member_id,'period':'2026-11','amount':'300000'},f'/clubs/{club}')
        assert '300.000đ' in r.text
        r=do_post(c,f'/clubs/{club}/dues',{'member_id':member_id,'period':'2026-11','amount':'320000'},f'/clubs/{club}')
        assert '320.000đ' in r.text and r.text.count('320.000đ')==1
        due_id=re.search(r'/dues/(\d+)/toggle',r.text).group(1)
        r=do_post(c,f'/dues/{due_id}/toggle',{},f'/clubs/{club}')
        assert 'Đã thu' in r.text
        # Logout requires CSRF and invalidates browser cookie.
        r=do_post(c,'/logout',{},f'/clubs/{club}')
        assert 'Chào mừng trở lại' in r.text
        assert c.get(f'/clubs/{club}').status_code == 401
        r=do_post(c,'/login',{'email':'host4@example.com','password':'long-strong-test-password'},'/login')
        assert 'CLB của bạn' in r.text

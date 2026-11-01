"""Explicit production smoke test using only uniquely marked synthetic tenants.

python -m scripts.smoke_group_release --env-file PRIVATE_ENV --run
No email is sent, no real money is recorded, and cleanup is scoped to created accounts.
"""
import argparse
import re
import secrets
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BASE_URL = 'https://sporthost.vercel.app'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--attendance', action='store_true')
    parser.add_argument('--billing', action='store_true')
    parser.add_argument('--closing', action='store_true')
    args = parser.parse_args()
    if args.closing:args.billing=True
    if args.billing:args.attendance=True
    if not args.run:
        raise SystemExit('No requests made; --run requires release authorization')
    values = dotenv_values(args.env_file)
    url = make_url(values.get('DATABASE_URL_UNPOOLED') or values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    engine = create_engine(url, connect_args={'connect_timeout': 15})
    marker = 'sporthost-group-qa-' + secrets.token_hex(12)
    emails = [marker + '@example.com', marker + '-other@example.com']
    club_id = None
    clients = [httpx.Client(base_url=BASE_URL, follow_redirects=True, timeout=60) for _ in range(4)]
    host, guest, second, outsider = clients

    def token(client, source):
        page = client.get(source)
        assert page.status_code == 200, f'Cannot open form source ({page.status_code})'
        match = re.search(r'name="csrf" value="([^"]+)"', page.text)
        if not match:
            match = re.search(r'name="csrf" value="([^"]+)"', client.get('/signup').text)
        return match.group(1)

    def post(client, path, data, source):
        return client.post(path, data={**data, 'csrf': token(client, source)})

    def register(client, public, phone, size):
        response = post(client, public, {'name': marker + ' guest', 'phone': phone,
                        'companion_name': [f'QA Companion {i}' for i in range(size - 1)]}, public)
        assert response.status_code == 200
        link = re.search(r'href="(/attend/[A-Za-z0-9_-]+)"', response.text)
        assert link, 'Own registration link was not returned'
        return link.group(1)

    def own_booking(game_id, phone):
        with engine.connect() as con:
            row = con.execute(text('''SELECT b.id,b.status,b.fee_amount,b.access_key,
                       (SELECT count(*) FROM clubhost.booking_participants p WHERE p.booking_id=b.id) AS size
                FROM clubhost.bookings b JOIN clubhost.members m ON m.id=b.member_id
                JOIN clubhost.game_sessions g ON g.id=b.session_id
                WHERE g.club_id=:club AND g.id=:game AND m.phone=:phone'''),
                {'club': club_id, 'game': game_id, 'phone': phone}).mappings().one()
            assert row['access_key'] == '', 'New booking must not store plaintext capability'
            return dict(row)

    try:
        assert host.get('/health').status_code == 200 and host.get('/ready').status_code == 200
        for client, email in ((host, emails[0]), (outsider, emails[1])):
            assert post(client, '/signup', {'email': email, 'password': secrets.token_urlsafe(32)}, '/signup').status_code == 200
        response = post(host, '/clubs', {'name': marker, 'sport_type': 'badminton', 'skill_guidance': 'QA only'}, '/clubs')
        assert response.status_code == 200
        club_id = int(response.url.path.split('/')[-1])
        assert outsider.get(f'/clubs/{club_id}').status_code == 404
        starts = (datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')) + timedelta(days=14)).strftime('%Y-%m-%dT19:00')
        for mode in ('MANUAL_APPROVE', 'AUTO_APPROVE'):
            response = post(host, f'/clubs/{club_id}/games', {'title': marker + ' ' + mode,
                            'starts_at': starts, 'capacity': 3, 'guest_fee': 70000, 'approval_mode': mode}, f'/clubs/{club_id}')
            assert response.status_code == 200
            game_id = int(response.url.path.split('/')[-1]); path = f'/games/{game_id}'
            public = re.search(r'http[^"\s]+/join/[A-Za-z0-9_-]+', response.text).group(0).removeprefix(BASE_URL)
            first_link = register(guest, public, '0902345678', 2)
            other_link = register(second, public, '0902345679', 2)
            first, other = own_booking(game_id, '0902345678'), own_booking(game_id, '0902345679')
            assert first['size'] == 2 and first['fee_amount'] == 140000
            if mode == 'MANUAL_APPROVE':
                assert first['status'] == other['status'] == 'pending'
                assert post(host, f'{path}/bookings/{first["id"]}/approve', {}, path).status_code == 200
                assert post(host, f'{path}/bookings/{other["id"]}/approve', {}, path).status_code == 200
                assert own_booking(game_id, '0902345679')['status'] == 'waitlist'
                assert post(guest, first_link + '/edit', {'companion_name': ['QA two', 'QA three']}, first_link).status_code == 200
                assert own_booking(game_id, '0902345678')['status'] == 'pending'
                assert post(host, f'{path}/bookings/{first["id"]}/approve', {}, path).status_code == 200
                assert '3/3' in host.get(path).text
            else:
                assert first['status'] == 'confirmed' and other['status'] == 'waitlist'
            public_page = outsider.get(public).text
            assert '0902345678' not in public_page and 'QA Companion' not in public_page
            private_page = guest.get(first_link)
            assert private_page.status_code == 200 and private_page.headers['referrer-policy'] == 'no-referrer'
            assert 'no-store' in private_page.headers['cache-control']
            assert post(guest, first_link + '/cancel', {}, first_link).status_code == 200
            assert own_booking(game_id, '0902345678')['status'] == 'cancelled'
            if mode == 'AUTO_APPROVE':
                assert own_booking(game_id, '0902345679')['status'] == 'confirmed'
            else:
                assert own_booking(game_id, '0902345679')['status'] == 'waitlist'
            assert post(host, f'{path}/bookings/{first["id"]}/private-link/rotate', {}, path).status_code == 200
            assert guest.get(first_link).status_code == 404
            assert outsider.post(f'{path}/bookings/{other["id"]}/private-link/revoke',
                                  data={'csrf': token(outsider, '/clubs')}).status_code == 404
            assert host.post(f'{path}/bookings/{other["id"]}/approve', data={'csrf': 'bad'}).status_code == 403
            assert second.get(other_link).status_code == 200
            print(mode + ' production flow passed: whole groups, capacity, edits/cancel, waitlist, hashed links and isolation', flush=True)
        if args.attendance:
            response = post(host, f'/clubs/{club_id}/games', {'title': marker + ' attendance',
                            'starts_at': starts, 'capacity': 3, 'guest_fee': 70000,
                            'approval_mode': 'AUTO_APPROVE',
                            **({'fee_mode':'COST_SHARING'} if args.billing else {})}, f'/clubs/{club_id}')
            assert response.status_code == 200
            game_id = int(response.url.path.split('/')[-1]); path = f'/games/{game_id}'
            public = re.search(r'http[^"\s]+/join/[A-Za-z0-9_-]+', response.text).group(0).removeprefix(BASE_URL)
            link = register(guest, public, '0902345680', 3)
            booking = own_booking(game_id, '0902345680')
            with engine.connect() as con:
                people = list(con.execute(text('SELECT id FROM clubhost.booking_participants WHERE booking_id=:booking ORDER BY position'),
                                          {'booking': booking['id']}).scalars())
            assert len(people) == 3
            assert post(host, path + '/lifecycle/start', {}, path).status_code == 200
            for person, action in zip(people, ('check_in', 'check_in', 'no_show')):
                assert post(host, f'{path}/participants/{person}/attendance', {'action': action, 'version': 0}, path).status_code == 200
            assert post(host, f'{path}/participants/{people[0]}/attendance',
                        {'action': 'no_show', 'version': 0, 'reason': 'stale QA'}, path).status_code == 409
            assert post(host, path + '/walk-ins', {'name': 'QA walk-in', 'phone': '0902345681'}, path).status_code == 200
            assert post(host, f'{path}/participants/{people[1]}/attendance', {'action': 'check_out', 'version': 1}, path).status_code == 200
            assert post(guest, link + '/edit', {'companion_name': ['QA changed']}, link).status_code == 409
            assert post(host, path + '/lifecycle/finish', {}, path).status_code == 200
            with engine.connect() as con:
                assert con.scalar(text('SELECT lifecycle_status FROM clubhost.game_sessions WHERE id=:game AND club_id=:club'),
                                  {'game': game_id, 'club': club_id}) == 'PLAY_FINISHED'
                assert con.scalar(text('SELECT count(*) FROM clubhost.bookings WHERE session_id=:game AND paid=true'), {'game': game_id}) == 0
                assert con.scalar(text('SELECT count(*) FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=:game AND p.attendance_status=\'CHECKED_IN\''), {'game': game_id}) == 3
            print('Sprint 3 production attendance passed: partial group, stale update, walk-in, checkout, guest edit freeze, finish without payment', flush=True)
            if args.billing:
                assert post(host,path+'/expenses',{'title':'QA court','amount':180001,'category':'COURT'},path).status_code==200
                bill=host.get(path+'/billing');assert bill.status_code==200
                draft_hash=re.search(r'name="draft_hash" value="([^"]+)"',bill.text).group(1)
                assert post(host,path+'/billing/issue',{'draft_hash':draft_hash},path+'/billing').status_code==200
                assert post(host,path+'/billing/issue',{'draft_hash':draft_hash},path+'/billing').status_code==200
                if args.closing:
                    assert post(host,path+'/billing/close',{},path+'/billing').status_code==200
                    assert post(host,path+'/billing/close',{},path+'/billing').status_code==200
                with engine.connect() as con:
                    total=con.scalar(text('SELECT sum(c.amount) FROM clubhost.charges c JOIN clubhost.charge_batches cb ON cb.id=c.batch_id WHERE cb.session_id=:game'),{'game':game_id})
                    due=con.scalar(text('SELECT sum(c.amount) FROM clubhost.charges c JOIN clubhost.charge_batches cb ON cb.id=c.batch_id WHERE cb.session_id=:game AND c.booking_id=:booking'),{'game':game_id,'booking':booking['id']})
                    assert total==180001 and due>30000
                money_path=f'{path}/billing/bookings/{booking["id"]}/money'
                receipt={'amount':30000,'kind':'RECEIVED','source':'BANK_TRANSFER','request_key':marker+'-bank'}
                assert post(host,money_path,receipt,path+'/billing').status_code==200
                assert post(host,money_path,receipt,path+'/billing').status_code==200
                assert '30.000đ' in guest.get(link).text
                assert post(host,money_path,{'amount':due-30000+10000,'kind':'RECEIVED','source':'CASH','request_key':marker+'-cash'},path+'/billing').status_code==200
                assert post(host,money_path,{'amount':10000,'kind':'REFUND_RECORDED','source':'CASH','request_key':marker+'-refund','reason':'QA fictional overpayment'},path+'/billing').status_code==200
                assert post(host,path+'/expenses',{'title':'QA locked','amount':1},path).status_code==409
                assert post(host,f'{path}/bookings/{booking["id"]}/paid',{},path).status_code==409
                with engine.connect() as con:
                    params={'game':game_id,'booking':booking['id']}
                    assert con.scalar(text('SELECT sum(amount) FROM clubhost.money_movements WHERE session_id=:game AND booking_id=:booking'),params)==due
                    assert con.scalar(text('SELECT count(*) FROM clubhost.money_movements WHERE session_id=:game'),params)==3
                    assert con.scalar(text('SELECT count(*) FROM clubhost.charge_batches WHERE session_id=:game'),params)==1
                assert 'Đã thu đủ' in guest.get(link).text
                print('Sprint 4 production billing passed: exact AA, issue retry, partial bank + cash, overpayment/refund, locked basis and outstanding walk-in',flush=True)
                if args.closing:
                    with engine.connect() as con:
                        charge_id=con.scalar(text('SELECT c.id FROM clubhost.charges c JOIN clubhost.charge_batches cb ON cb.id=c.batch_id WHERE cb.session_id=:game AND c.booking_id=:booking ORDER BY c.id LIMIT 1'),{'game':game_id,'booking':booking['id']})
                    change={'charge_id':charge_id,'version':1,'amount':-1000,'reason':'QA adjustment after close','request_key':marker+'-adjustment'}
                    assert post(host,path+'/billing/adjustments',change,path+'/billing').status_code==200
                    assert post(host,path+'/billing/adjustments',change,path+'/billing').status_code==200
                    assert post(host,path+'/billing/adjustments',{**change,'amount':-2000,'request_key':marker+'-stale'},path+'/billing').status_code==409
                    with engine.connect() as con:
                        assert con.scalar(text('SELECT lifecycle_status FROM clubhost.game_sessions WHERE id=:game'),{'game':game_id})=='SETTLED'
                    assert outsider.get(path+'/billing').status_code==404
                    print('Sprint 5 production closing passed: closed while unpaid, collected after close, versioned adjustment/retry/stale denial and isolation',flush=True)
        print('Production smoke checks passed', flush=True)
    finally:
        for client in clients:
            client.close()
        with engine.begin() as con:
            hosts = list(con.execute(text('SELECT id FROM clubhost.hosts WHERE email IN (:first,:second)'),
                                    {'first': emails[0], 'second': emails[1]}).scalars())
            for host_id in hosts:
                clubs = con.execute(text('SELECT id,name FROM clubhost.clubs WHERE owner_id=:host'), {'host': host_id}).all()
                for test_club, name in clubs:
                    assert name == marker and (club_id is None or test_club == club_id)
                    params = {'club': test_club}
                    # No proof/images are uploaded in this test; no real receipt is recorded.
                    assert con.scalar(text('SELECT count(*) FROM clubhost.stored_assets WHERE club_id=:club'), params) == 0
                    game_ids = 'SELECT id FROM clubhost.game_sessions WHERE club_id=:club'
                    booking_ids = f'SELECT id FROM clubhost.bookings WHERE session_id IN ({game_ids})'
                    if con.scalar(text("SELECT to_regclass('clubhost.money_movements') IS NOT NULL")):
                        if con.scalar(text("SELECT to_regclass('clubhost.charge_adjustments') IS NOT NULL")):
                            con.execute(text(f'DELETE FROM clubhost.charge_adjustments WHERE batch_id IN (SELECT id FROM clubhost.charge_batches WHERE session_id IN ({game_ids}))'),params)
                        con.execute(text(f'DELETE FROM clubhost.money_movements WHERE session_id IN ({game_ids})'), params)
                        con.execute(text(f'DELETE FROM clubhost.charges WHERE booking_id IN ({booking_ids})'), params)
                        con.execute(text(f'DELETE FROM clubhost.charge_batches WHERE session_id IN ({game_ids})'), params)
                    con.execute(text(f'DELETE FROM clubhost.expenses WHERE session_id IN ({game_ids})'),params)
                    con.execute(text(f'DELETE FROM clubhost.booking_participants WHERE booking_id IN ({booking_ids})'), params)
                    con.execute(text(f'DELETE FROM clubhost.bookings WHERE session_id IN ({game_ids})'), params)
                    con.execute(text('DELETE FROM clubhost.game_sessions WHERE club_id=:club'), params)
                    con.execute(text('DELETE FROM clubhost.members WHERE club_id=:club'), params)
                    con.execute(text('DELETE FROM clubhost.audit_logs WHERE club_id=:club'), params)
                    con.execute(text('DELETE FROM clubhost.clubs WHERE id=:club'), params)
                con.execute(text('DELETE FROM clubhost.audit_logs WHERE host_id=:host'), {'host': host_id})
                con.execute(text('DELETE FROM clubhost.hosts WHERE id=:host AND email IN (:first,:second)'),
                            {'host': host_id, 'first': emails[0], 'second': emails[1]})
        engine.dispose()
        print('Cleanup complete: only accounts and CLB created by this smoke run were removed', flush=True)


if __name__ == '__main__':
    main()

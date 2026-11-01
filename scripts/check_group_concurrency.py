"""Run real PostgreSQL group races in a generated SportHost-only schema.

Usage: python -m scripts.check_group_concurrency --env-file PRIVATE_ENV_FILE
Never changes the deployed SportHost schema; cleans up only its generated schema.
"""
import argparse
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def worker():
    from concurrent.futures import ThreadPoolExecutor
    from datetime import timedelta
    from fastapi.testclient import TestClient
    from sqlalchemy import select
    from app.main import app, SETTINGS, SessionLocal, Booking, GameSession, confirm_count
    from app.workspace import now_local
    assert SETTINGS['driver'] == 'postgresql'
    assert re.fullmatch(r'sporthost_group_check_[0-9a-f]{16}', SETTINGS['schema'])
    legacy = os.getenv('SPORTHOST_CHECK_LEGACY_TOKEN')
    if legacy:
        from app.booking_service import digest
        with SessionLocal() as db:
            old = db.scalar(select(Booking).where(Booking.legacy_token_digest == digest(legacy)))
            assert old and old.party_size == 1 and old.fee_amount == 70000 and old.paid
            assert old.participants[0].fee_amount == 70000
        with TestClient(app) as legacy_guest:
            assert legacy_guest.get('/attend/' + legacy).status_code == 200
        print('Legacy migration fixture passed: one participant, original fee/paid state, old private link')

    def submit(client, path, data, source):
        token = re.search(r'name="csrf" value="([^"]+)"', client.get(source).text).group(1)
        return client.post(path, data={**data, 'csrf': token}, follow_redirects=True)

    with TestClient(app) as host:
        result = submit(host, '/signup', {'email': 'isolated-race@example.com', 'password': 'isolated-race-password'}, '/signup')
        assert result.status_code == 200
        result = submit(host, '/clubs', {'name': 'Isolated PostgreSQL race'}, '/clubs')
        club_id = int(result.url.path.split('/')[-1])
        starts = (now_local() + timedelta(days=7)).strftime('%Y-%m-%dT19:00')
        for mode, capacity, size in [('AUTO_APPROVE', 1, 1), ('AUTO_APPROVE', 3, 2), ('MANUAL_APPROVE', 3, 2)]:
            result = submit(host, f'/clubs/{club_id}/games', {'title': 'Seat race', 'starts_at': starts,
                            'capacity': capacity, 'guest_fee': 70000, 'approval_mode': mode}, f'/clubs/{club_id}')
            assert result.status_code == 200
            game_id = int(result.url.path.split('/')[-1])
            with SessionLocal() as db:
                public = '/join/' + db.get(GameSession, game_id).public_id
            def join(index):
                with TestClient(app) as guest:
                    response = submit(guest, public, {'name': f'Race {index}', 'phone': f'090234567{index}',
                                      'companion_name': ['Companion'] if size == 2 else []}, public)
                    assert response.status_code == 200
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(join, (0, 1)))
            with SessionLocal() as db:
                bookings = db.scalars(select(Booking).where(Booking.session_id == game_id).order_by(Booking.id)).all()
                assert len(bookings) == 2 and all(b.party_size == size for b in bookings)
            if mode == 'MANUAL_APPROVE':
                cookie = host.cookies.get('clubhost')
                def approve(booking_id):
                    with TestClient(app) as cohost:
                        cohost.cookies.set('clubhost', cookie)
                        response = submit(cohost, f'/games/{game_id}/bookings/{booking_id}/approve', {}, f'/games/{game_id}')
                        assert response.status_code == 200
                with ThreadPoolExecutor(max_workers=2) as pool:
                    list(pool.map(approve, [b.id for b in bookings]))
            with SessionLocal() as db:
                states = list(db.scalars(select(Booking.status).where(Booking.session_id == game_id)))
                assert sorted(states) == ['confirmed', 'waitlist'], states
                assert confirm_count(db, game_id) == size <= capacity
        print('Three PostgreSQL concurrency scenarios passed: single-slot race, whole-group auto race, manual approval race')
        if hasattr(GameSession,'lifecycle_status'):
            from app.main import BookingParticipant
            result=submit(host,f'/clubs/{club_id}/games',{'title':'Attendance race','starts_at':starts,
                          'capacity':1,'approval_mode':'AUTO_APPROVE'},f'/clubs/{club_id}')
            race_game=int(result.url.path.split('/')[-1])
            path=f'/games/{race_game}'
            with SessionLocal() as db:public='/join/'+db.get(GameSession,race_game).public_id
            with TestClient(app) as player:
                assert submit(player,public,{'name':'Attendance','phone':'0902345670'},public).status_code==200
            with SessionLocal() as db:
                person=db.scalar(select(BookingParticipant).join(Booking).where(Booking.session_id==race_game))
            cookie=host.cookies.get('clubhost')
            def update_attendance(action):
                with TestClient(app) as manager:
                    manager.cookies.set('clubhost',cookie)
                    return submit(manager,f'{path}/participants/{person.id}/attendance',{'action':action,'version':0},path).status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes=list(pool.map(update_attendance,('check_in','no_show')))
            assert sorted(outcomes)==[200,409],outcomes
            with SessionLocal.begin() as db:
                p=db.get(BookingParticipant,person.id)
                p.attendance_status='NO_SHOW';p.arrived_at=None
            def walkin(index):
                with TestClient(app) as manager:
                    manager.cookies.set('clubhost',cookie)
                    return submit(manager,path+'/walk-ins',{'name':'Walk in','phone':f'090455555{index}'},path).status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes=list(pool.map(walkin,(0,1)))
            assert sorted(outcomes)==[200,409],outcomes
            with SessionLocal() as db:assert confirm_count(db,race_game)==1
            print('Two PostgreSQL attendance scenarios passed: conflicting host updates and two walk-ins racing for one freed seat')
        if hasattr(GameSession,'fee_mode'):
            from app.main import ChargeBatch,MoneyMovement
            from app.finance_service import draft,fingerprint,balances
            result=submit(host,f'/clubs/{club_id}/games',{'title':'Money race','starts_at':starts,
                          'capacity':1,'guest_fee':70000,'approval_mode':'AUTO_APPROVE'},f'/clubs/{club_id}')
            money_game=int(result.url.path.split('/')[-1]);path=f'/games/{money_game}'
            with SessionLocal() as db:public='/join/'+db.get(GameSession,money_game).public_id
            with TestClient(app) as player:
                assert submit(player,public,{'name':'Payer','phone':'0902345685'},public).status_code==200
            with SessionLocal() as db:
                b=db.scalar(select(Booking).where(Booking.session_id==money_game));pid=b.participants[0].id
            submit(host,path+'/lifecycle/start',{},path)
            submit(host,f'{path}/participants/{pid}/attendance',{'action':'check_in','version':0},path)
            submit(host,path+'/lifecycle/finish',{},path)
            with SessionLocal() as db:expected=fingerprint(draft(db,db.get(GameSession,money_game)))
            def issue_money(index):
                with TestClient(app) as finance:
                    finance.cookies.set('clubhost',cookie)
                    return submit(finance,path+'/billing/issue',{'draft_hash':expected},path+'/billing').status_code
            with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(issue_money,(0,1)))
            assert outcomes==[200,200],outcomes
            with SessionLocal() as db:
                assert len(db.scalars(select(ChargeBatch).where(ChargeBatch.session_id==money_game)).all())==1
            def receive(value):
                amount,key=value
                with TestClient(app) as finance:
                    finance.cookies.set('clubhost',cookie)
                    return submit(finance,f'{path}/billing/bookings/{b.id}/money',{'amount':amount,'kind':'RECEIVED',
                        'source':'CASH','request_key':key},path+'/billing').status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes=list(pool.map(receive,[(10000,'duplicate-money-race')]*2))
            assert outcomes==[200,200],outcomes
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes=list(pool.map(receive,[(20000,'distinct-money-one'),(30000,'distinct-money-two')]))
            assert outcomes==[200,200],outcomes
            with SessionLocal() as db:
                assert len(db.scalars(select(MoneyMovement).where(MoneyMovement.session_id==money_game)).all())==3
                result=balances(db,db.get(GameSession,money_game))[0]
                assert result['net']==60000 and result['outstanding']==10000
            print('Three PostgreSQL billing scenarios passed: concurrent issue, duplicate receipt retry, distinct partial receipts')
            if hasattr(ChargeBatch,'closed_at'):
                from app.main import Charge,ChargeAdjustment
                with SessionLocal() as db:
                    batch=db.scalar(select(ChargeBatch).where(ChargeBatch.session_id==money_game))
                    charge=db.scalar(select(Charge).where(Charge.batch_id==batch.id))
                def close(index):
                    with TestClient(app) as finance:
                        finance.cookies.set('clubhost',cookie)
                        return submit(finance,path+'/billing/close',{},path+'/billing').status_code
                with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(close,(0,1)))
                assert outcomes==[200,200],outcomes
                def adjust(amount):
                    with TestClient(app) as finance:
                        finance.cookies.set('clubhost',cookie)
                        return submit(finance,path+'/billing/adjustments',{'charge_id':charge.id,'version':1,
                            'amount':amount,'reason':'Concurrent adjustment','request_key':f'adjustment-race-{amount}'},path+'/billing').status_code
                with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(adjust,(-1000,-2000)))
                assert sorted(outcomes)==[200,409],outcomes
                with SessionLocal() as db:
                    assert len(db.scalars(select(ChargeAdjustment).where(ChargeAdjustment.batch_id==batch.id)).all())==1
                    assert db.get(GameSession,money_game).lifecycle_status=='SETTLED'
                print('Two PostgreSQL closing scenarios passed: idempotent concurrent close and conflicting versioned adjustments')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file')
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        worker(); return
    if not args.env_file:
        parser.error('--env-file is required; no production configuration is selected implicitly')
    values = dotenv_values(args.env_file)
    raw = values.get('DATABASE_URL_UNPOOLED') or values.get('DATABASE_URL')
    if not raw or '[SENSITIVE]' in raw:
        raise SystemExit('A usable PostgreSQL URL is required in the private environment file')
    url = make_url(raw).set(drivername='postgresql+psycopg')
    schema = 'sporthost_group_check_' + secrets.token_hex(8)
    engine = create_engine(url, connect_args={'connect_timeout': 15})
    env = dict(os.environ, APP_ENV='test', DB_SCHEMA=schema, DATABASE_URL=url.render_as_string(hide_password=False),
               SECRET_KEY='isolated-postgres-group-race-secret', COOKIE_SECURE='false')
    env.pop('VERCEL', None)
    created = False
    try:
        with engine.begin() as con:
            con.execute(text(f'CREATE SCHEMA "{schema}"'))
        created = True
        migration = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', '0005_club_settings'], env=env, capture_output=True, timeout=120)
        if migration.returncode:
            raise RuntimeError('Test-schema migration failed; inspect privately before release')
        legacy = secrets.token_urlsafe(24)
        with engine.begin() as con:
            host = con.scalar(text(f'''INSERT INTO "{schema}".hosts (email,password_hash)
                VALUES ('legacy-fixture@example.com','test-only') RETURNING id'''))
            club = con.scalar(text(f'''INSERT INTO "{schema}".clubs (owner_id,name,location)
                VALUES (:host,'Legacy badminton','Q8') RETURNING id'''), {'host': host})
            member = con.scalar(text(f'''INSERT INTO "{schema}".members (club_id,name,phone,kind,level)
                VALUES (:club,'Legacy player','0901111111','guest','TB') RETURNING id'''), {'club': club})
            game = con.scalar(text(f'''INSERT INTO "{schema}".game_sessions
                (club_id,public_id,title,venue,starts_at,capacity,fixed_fee,guest_fee,is_open)
                VALUES (:club,'legacy-fixture','Legacy','Q8','2027-01-08T19:00',15,0,70000,true) RETURNING id'''), {'club': club})
            con.execute(text(f'''INSERT INTO "{schema}".bookings
                (session_id,member_id,status,paid,attended,fee_amount,access_key,payment_status)
                VALUES (:game,:member,'confirmed',true,false,70000,:token,'confirmed')'''),
                {'game': game, 'member': member, 'token': legacy})
        migration = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], env=env, capture_output=True, timeout=120)
        if migration.returncode:
            raise RuntimeError('Legacy migration failed in generated test schema; inspect privately before release')
        env['SPORTHOST_CHECK_LEGACY_TOKEN'] = legacy
        check = subprocess.run([sys.executable, '-m', 'scripts.check_group_concurrency', '--worker'],
                               env=env, capture_output=True, timeout=180)
        if check.returncode:
            # Store debugging locally, not in shared logs (SQLAlchemy errors may contain records).
            output = Path('.vercel/test-artifacts/postgres-group-error.log')
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(check.stdout + check.stderr)
            raise RuntimeError('PostgreSQL concurrency check failed; see private test artifact')
        print(check.stdout.decode('utf-8').strip())
    finally:
        if created:
            assert re.fullmatch(r'sporthost_group_check_[0-9a-f]{16}', schema)
            with engine.begin() as con:
                con.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


if __name__ == '__main__':
    main()

"""Acceptance F-01: one complete mobile session, with 15 actual players and unpaid close."""
import os
from pathlib import Path
from datetime import timedelta

import pytest
from sqlalchemy import select,func
from test_group_bookings import context,post,register,booking,csrf
from test_billing import image_bytes
from app.main import (SessionLocal,Member,GameSession,Booking,Charge,ChargeBatch,PaymentProof,
                      MoneyMovement,confirm_count)
from app.workspace import now_local
from app.finance_service import summary,balances

pytestmark=pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS')!='1',reason='Browser acceptance is opt-in')


def test_facebook_to_closed_session_15_players_mobile(context,browser_server):
    from playwright.sync_api import sync_playwright,expect
    host,guest,club=context
    club_path=f'/clubs/{club}'
    for index in range(8):
        assert post(host,club_path+'/members',{'name':f'Cố định {index}','phone':f'090661000{index}',
                    'kind':'fixed'},club_path).status_code==200
    start=(now_local()+timedelta(days=14))
    start+=timedelta(days=(4-start.weekday())%7)
    starts=start.strftime('%Y-%m-%dT19:00')
    with SessionLocal() as db:
        fixed=db.scalars(select(Member).where(Member.club_id==club,Member.kind=='fixed').order_by(Member.id)).all()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',headless=True)
        hc=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        hc.add_cookies([{'name':'clubhost','value':host.cookies.get('clubhost'),'url':browser_server}])
        gc=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        hp=hc.new_page();gp=gc.new_page();errors=[]
        for p in (hp,gp):p.on('pageerror',lambda error:errors.append(str(error)))
        hp.on('dialog',lambda dialog:dialog.accept());gp.on('dialog',lambda dialog:dialog.accept())
        try:
            hp.goto(browser_server+club_path+'/settings#payment')
            hp.get_by_label('Ảnh QR mới',exact=True).set_input_files({'name':'host-qr.png','mimeType':'image/png','buffer':image_bytes('white')})
            hp.get_by_label('Ngân hàng',exact=True).fill('Ngân hàng thử')
            hp.get_by_label('Tên chủ tài khoản',exact=True).fill('Host thử nghiệm')
            hp.get_by_role('button',name='Lưu thông tin nhận tiền',exact=True).click()
            hp.goto(browser_server+f'/schedule?club_id={club}&create=1#create-game')
            form=hp.locator('form[data-game-create]')
            form.get_by_label('Tên buổi đánh',exact=True).fill('Giao lưu thứ Sáu 15 người')
            form.get_by_label('Sân / địa điểm',exact=True).fill('Sân cầu lông Quận 8')
            form.get_by_label('Ngày và giờ bắt đầu',exact=True).fill(starts)
            form.get_by_label('Số chỗ tối đa',exact=True).fill('15')
            form.locator('input[name="fixed_fee"]').fill('70000')
            form.get_by_text('Thông tin công khai & chính sách đăng ký',exact=True).click()
            form.locator('select[name="fee_mode"]').select_option('FIXED_PRICE')
            form.locator('input[name="guest_fee"]').fill('150000')
            form.locator('select[name="approval_mode"]').select_option('MANUAL_APPROVE')
            form.get_by_role('button',name='Tạo lịch đánh',exact=True).click()
            gid=int(hp.url.split('/games/')[1].split('#')[0]);path=f'/games/{gid}'
            for member in fixed:
                if not hp.locator(f'form[action="{path}/fixed"]').is_visible():
                    hp.get_by_text('Thêm thành viên cố định vào buổi',exact=True).click()
                form=hp.locator(f'form[action="{path}/fixed"]')
                form.locator('select[name="member_id"]').select_option(str(member.id))
                form.get_by_role('button',name='Xác nhận chỗ',exact=True).click()
            with SessionLocal() as db:public='/join/'+db.get(GameSession,gid).public_id
            gp.goto(browser_server+public+'?source=facebook')
            gp.get_by_label('Số điện thoại',exact=True).fill('0906611000')
            gp.get_by_role('button',name='Tiếp tục',exact=True).click()
            gp.get_by_label('Họ tên',exact=True).fill('Nhóm Facebook')
            gp.get_by_text('Đăng ký hộ người đi cùng (tùy chọn)',exact=True).click()
            gp.locator('[name="companion_name"]').nth(0).fill('Bạn cùng nhóm 1')
            gp.locator('[name="companion_name"]').nth(1).fill('Bạn cùng nhóm 2')
            gp.get_by_role('button',name='Xác nhận gửi yêu cầu',exact=True).click()
            gp.get_by_role('link',name='Xem đăng ký & thanh toán của tôi',exact=True).click()
            group_link=gp.url
            for index in range(1,8):
                assert post(guest,public+'?source=facebook',{'name':f'Khách Facebook {index}','phone':f'090661100{index}'},public).status_code==200
            group=booking(gid,'0906611000')
            singles=[booking(gid,f'090661100{index}') for index in range(1,8)]
            hp.goto(browser_server+path)
            for b in [group]+singles:
                hp.locator(f'form[action="{path}/bookings/{b.id}/approve"] button').click()
            with SessionLocal() as db:
                assert confirm_count(db,gid)==15
                assert all(db.get(Booking,b.id).status=='waitlist' for b in singles[4:])
                assert group.channel=='facebook_link'
            # One confirmed single cancels; receive one whole waiting booking.
            link='/attend/'+singles[0].access_key
            assert post(guest,link+'/cancel',{},link).status_code==200
            hp.reload();hp.locator(f'form[action="{path}/bookings/{singles[4].id}/approve"] button').click()
            hp.get_by_role('button',name='Bắt đầu buổi đánh',exact=True).click()
            with SessionLocal() as db:
                confirmed=db.scalars(select(Booking).where(Booking.session_id==gid,Booking.status=='confirmed').order_by(Booking.id)).all()
            no_show=group.participants[2].id
            for b in confirmed:
                for person in b.participants:
                    card=hp.locator(f'#attendee-{person.id}')
                    card.get_by_role('button',name='Vắng mặt' if person.id==no_show else 'Có mặt',exact=True).click()
            hp.get_by_text('Thêm người đến trực tiếp',exact=True).click()
            walk=hp.locator(f'form[action="{path}/walk-ins"]')
            walk.get_by_label('Họ tên',exact=True).fill('Khách tại sân')
            walk.get_by_label('Số điện thoại',exact=True).fill('0906612000')
            walk.get_by_role('button',name='Thêm & điểm danh có mặt',exact=True).click()
            hp.locator(f'#attendee-{group.participants[1].id}').get_by_role('button',name='Đã về / về sớm',exact=True).click()
            expect(hp.locator('.attendance-metrics')).to_contain_text('15')
            hp.get_by_role('button',name='Kết thúc đánh',exact=True).click()
            hp.get_by_role('link',name='Thanh toán',exact=True).click()
            for title,amount,category in [('Tiền sân',900000,'COURT'),('Tiền cầu',150000,'EQUIPMENT')]:
                form=hp.locator(f'form[action="{path}/expenses"]')
                form.locator('[name="title"]').fill(title);form.locator('[name="amount"]').fill(str(amount))
                form.locator('[name="category"]').select_option(category)
                form.get_by_role('button',name='Ghi chi phí',exact=True).click()
            hp.get_by_role('link',name='Bản nháp chốt tiền & phát hành',exact=True).click()
            expect(hp.locator('.billing-person')).to_have_count(16)
            hp.get_by_role('button',name='Phát hành tiền cần đóng',exact=True).click()
            # 8 fixed members pay 70k each; 7 guests pay 150k each.
            with SessionLocal() as db:
                batch=db.scalar(select(ChargeBatch).where(ChargeBatch.session_id==gid))
                assert sum(db.scalars(select(Charge.amount).where(Charge.batch_id==batch.id)))==1610000
                assert sum(db.scalars(select(Charge.amount).join(Booking).where(Charge.batch_id==batch.id,Booking.member_id.in_([m.id for m in fixed]))))==560000
            gp.goto(group_link)
            expect(gp.get_by_text('Còn thiếu 300.000đ',exact=False)).to_be_visible()
            gp.get_by_label('Số tiền đã báo chuyển (VND)',exact=True).fill('300000')
            gp.get_by_label('Ảnh biên nhận',exact=True).set_input_files({'name':'proof.png','mimeType':'image/png','buffer':image_bytes('red')})
            gp.get_by_role('button',name='Tôi đã chuyển khoản · gửi biên nhận',exact=True).click()
            hp.goto(browser_server+f'/payments/review?club_id={club}')
            hp.get_by_label('Số tiền thực nhận (VND)',exact=True).fill('300000')
            hp.get_by_role('button',name='Đã đối chiếu · xác nhận đã thu',exact=True).click()
            for b,amount,channel in [(singles[1],150000,'CASH'),(singles[2],50000,'BANK_TRANSFER')]:
                hp.goto(browser_server+path+'/billing')
                card=hp.locator('.payer-card').filter(has=hp.get_by_role('heading',name=f'Khách Facebook {2 if b.id==singles[1].id else 3}',exact=True))
                card.get_by_text('Ghi thu / hoàn tiền thực tế',exact=True).click()
                card.get_by_label('Số tiền thực tế (VND)',exact=True).fill(str(amount))
                card.get_by_label('Kênh tiền',exact=True).select_option(channel)
                card.get_by_role('button',name='Xác nhận tiền thực tế',exact=True).click()
            # A different guest reports a picture, without actual money; remains fully unpaid.
            unpaid=singles[3];unpaid_link='/attend/'+unpaid.access_key
            response=guest.post(unpaid_link+'/proof',data={'csrf':csrf(guest.get(unpaid_link)),'reported_amount':150000},
                files={'proof':('unverified.png',image_bytes('blue'),'image/png')})
            assert response.status_code in (200,303)
            hp.goto(browser_server+path+'/billing')
            hp.get_by_role('button',name='Chốt sổ buổi đánh',exact=True).click()
            expect(hp.get_by_text('Đã chốt sổ lúc',exact=False)).to_be_visible()
            with SessionLocal() as db:
                final=summary(balances(db,db.get(GameSession,gid)))
                assert final['amount']==1610000 and final['net']==500000 and final['outstanding']==1110000
                assert not db.get(Booking,unpaid.id).paid
                assert db.scalar(select(PaymentProof.status).where(PaymentProof.booking_id==unpaid.id))=='reported'
                assert db.get(GameSession,gid).lifecycle_status=='SETTLED'
                assert confirm_count(db,gid)==15
            gp.reload();expect(gp.get_by_text('Đã thu đủ',exact=False)).to_be_visible()
            assert '0906611002' not in gp.content() and 'Khách Facebook 2' not in gp.content()
            for page in (hp,gp):assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            artifact=Path('.vercel/test-artifacts/session-15-mobile.png');artifact.parent.mkdir(parents=True,exist_ok=True)
            hp.screenshot(path=str(artifact),full_page=True)
            assert not errors
        finally:hc.close();gc.close();browser.close()

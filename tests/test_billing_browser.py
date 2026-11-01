import os
from pathlib import Path
import re

import pytest
from test_group_bookings import context
from test_billing import finished, image_bytes

pytestmark=pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS')!='1',reason='Browser checks are opt-in')


def test_mobile_issue_report_review_partial_then_cash(context,browser_server):
    from playwright.sync_api import sync_playwright,expect
    host,guest,club=context
    game_id,record=finished(context,size=1,fee_mode='COST_SHARING')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',headless=True)
        hc=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        hc.add_cookies([{'name':'clubhost','value':host.cookies.get('clubhost'),'url':browser_server}])
        gc=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        hp=hc.new_page();gp=gc.new_page();errors=[]
        hp.on('pageerror',lambda e:errors.append(str(e)));gp.on('pageerror',lambda e:errors.append(str(e)))
        hp.on('dialog',lambda dialog:dialog.accept())
        try:
            hp.goto(browser_server+f'/games/{game_id}#finance')
            form=hp.locator(f'form[action="/games/{game_id}/expenses"]')
            form.get_by_label('Khoản chi',exact=True).fill('Tiền sân')
            form.get_by_label('Số tiền (VND)',exact=True).fill('70000')
            form.get_by_role('button',name='Ghi chi phí',exact=True).click()
            hp.get_by_role('link',name='Bản nháp chốt tiền & phát hành',exact=True).click()
            expect(hp.get_by_role('heading',name='Bản nháp chốt tiền',exact=True)).to_be_visible()
            hp.get_by_role('button',name='Phát hành tiền cần đóng',exact=True).click()
            expect(hp.get_by_text('Đã phát hành phiên bản',exact=False)).to_be_visible()
            gp.goto(browser_server+'/attend/'+record.access_key)
            gp.get_by_label('Số tiền đã báo chuyển (VND)',exact=True).fill('70000')
            gp.get_by_label('Ảnh biên nhận',exact=True).set_input_files({'name':'proof.png','mimeType':'image/png','buffer':image_bytes()})
            gp.get_by_role('button',name='Tôi đã chuyển khoản · gửi biên nhận',exact=True).click()
            expect(gp.get_by_text('Còn thiếu 70.000đ',exact=False)).to_be_visible()
            hp.goto(browser_server+f'/payments/review?club_id={club}')
            hp.get_by_label('Số tiền thực nhận (VND)',exact=True).fill('30000')
            hp.get_by_role('button',name='Đã đối chiếu · xác nhận đã thu',exact=True).click()
            gp.reload();expect(gp.get_by_text('Còn thiếu 40.000đ',exact=False)).to_be_visible()
            hp.goto(browser_server+f'/games/{game_id}/billing')
            hp.get_by_text('Ghi thu / hoàn tiền thực tế',exact=True).click()
            hp.get_by_label('Số tiền thực tế (VND)',exact=True).fill('40000')
            hp.get_by_label('Kênh tiền',exact=True).select_option('CASH')
            hp.get_by_role('button',name='Xác nhận tiền thực tế',exact=True).click()
            gp.reload();expect(gp.get_by_text('Đã thu đủ',exact=False)).to_be_visible()
            for page in (hp,gp):assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            artifact=Path('.vercel/test-artifacts/billing-mobile.png');artifact.parent.mkdir(parents=True,exist_ok=True)
            hp.screenshot(path=str(artifact),full_page=True)
            assert not errors
        finally:
            hc.close();gc.close();browser.close()

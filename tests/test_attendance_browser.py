import os
from pathlib import Path

import pytest

from test_group_bookings import context, game, register

pytestmark=pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS')!='1',reason='Browser checks are opt-in')


def test_host_runs_partial_group_on_mobile_without_horizontal_table(context,browser_server):
    from playwright.sync_api import sync_playwright,expect
    host,guest,club=context
    game_id,public=game(context,capacity=3,mode='AUTO_APPROVE')
    register(guest,public,3)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',headless=True)
        browser_context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        browser_context.add_cookies([{'name':'clubhost','value':host.cookies.get('clubhost'),'url':browser_server}])
        page=browser_context.new_page()
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            page.goto(browser_server+f'/games/{game_id}')
            expect(page).to_have_title('Buổi đánh nhóm · SportHost Beta')
            page.get_by_role('button',name='Bắt đầu buổi đánh',exact=True).click()
            cards=page.locator('.attendance-person')
            expect(cards).to_have_count(3)
            cards.nth(0).get_by_role('button',name='Có mặt',exact=True).click()
            cards.nth(1).get_by_role('button',name='Có mặt',exact=True).click()
            cards.nth(2).get_by_role('button',name='Vắng mặt',exact=True).click()
            page.get_by_text('Thêm người đến trực tiếp',exact=True).click()
            form=page.locator(f'form[action="/games/{game_id}/walk-ins"]')
            form.get_by_label('Họ tên',exact=True).fill('Khách tại sân')
            form.get_by_label('Số điện thoại',exact=True).fill('0903334445')
            form.get_by_role('button',name='Thêm & điểm danh có mặt',exact=True).click()
            expect(cards).to_have_count(4)
            cards.nth(1).get_by_role('button',name='Đã về / về sớm',exact=True).click()
            expect(cards.nth(1)).to_contain_text('Đã về')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert cards.nth(0).bounding_box()['width']<=375
            page.get_by_role('button',name='Kết thúc đánh',exact=True).click()
            expect(page.locator('.session-controls')).to_contain_text('chưa chốt sổ')
            artifact=Path('.vercel/test-artifacts/attendance-mobile.png');artifact.parent.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(artifact),full_page=True)
            assert not errors
        finally:
            browser_context.close();browser.close()
